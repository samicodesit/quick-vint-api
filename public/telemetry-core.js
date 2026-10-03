/* Durable transport mechanics. This file is also distributed with the website. */
(function (root) {
  "use strict";
  const bytes = (value) =>
    new TextEncoder().encode(JSON.stringify(value)).length;
  const RETRY_MS = [60000, 300000, 900000, 1800000];
  function createQueue({ storage, identity, send, now = Date.now }) {
    let flushing;
    function prune(state) {
      state.events ||= [];
      state.dropped ||= 0;
      const before = state.events.length;
      state.events = state.events.filter(
        (item) => now() - item.createdAt < 86400000,
      );
      state.dropped += before - state.events.length;
      while (state.events.length > 200 || bytes(state) > 524288) {
        const routine = state.events.findIndex((item) => !item.critical);
        state.events.splice(routine < 0 ? 0 : routine, 1);
        state.dropped++;
      }
    }
    async function enqueue(event, accountId, critical = false) {
      try {
        if (bytes(event) > 47000) return { queued: false, reason: "oversized" };
        return await storage.transact((state) => {
          if (!state.events?.some((entry) => entry.event.id === event.id)) {
            state.events ||= [];
            state.events.push({
              event,
              accountId: accountId || null,
              critical,
              createdAt: now(),
              nextAt: 0,
              attempts: 0,
            });
          }
          prune(state);
          return {
            queued: state.events.some((entry) => entry.event.id === event.id),
          };
        });
      } catch {
        return { queued: false, reason: "storage_unavailable" };
      }
    }
    async function deliver() {
      try {
        const current = await identity();
        const batch = await storage.transact((state) => {
          prune(state);
          const eligible = state.events.filter(
            (entry) =>
              entry.nextAt <= now() &&
              (!entry.accountId ||
                (entry.accountId === current?.id && current?.token)),
          );
          eligible.sort(
            (a, b) =>
              Number(b.critical) - Number(a.critical) ||
              a.createdAt - b.createdAt,
          );
          const owner = eligible[0]?.accountId;
          const selected = [];
          for (const entry of eligible) {
            if (entry.accountId !== owner) continue;
            if (state.dropped > 0 && !entry.event.context?.queueDropped) {
              entry.event.context = {
                ...entry.event.context,
                queueDropped: state.dropped,
              };
              state.dropped = 0;
            }

            if (
              selected.length >= 25 ||
              bytes({
                schemaVersion: 2,
                events: [...selected, entry].map((item) => ({
                  ...item.event,
                  accountId: item.accountId,
                })),
              }) > 49152
            )
              break;
            // Reserve before I/O so another tab cannot concurrently send it.
            entry.nextAt = now() + 60000;
            selected.push({ ...entry });
          }
          return selected;
        });
        if (!batch.length) return { delivered: false, acknowledgedIds: [] };
        const ids = new Set(batch.map((entry) => entry.event.id));
        let response,
          payload = {},
          retryAfter = 0;
        try {
          response = await send(
            {
              schemaVersion: 2,
              events: batch.map((entry) => ({
                ...entry.event,
                accountId: entry.accountId,
              })),
            },
            batch[0].accountId ? current.token : null,
          );
          const header = response.headers?.get("Retry-After");
          if (header)
            retryAfter = /^\d+$/.test(header)
              ? Number(header) * 1000
              : Math.max(0, Date.parse(header) - now());
          if (response.status === 200 || response.status === 503)
            payload = await response.json();
        } catch {
          /* Durable retry below, never a product retry. */
        }
        const confirmed = new Set(
          [
            ...(payload.acknowledgedIds || []),
            ...(payload.duplicateIds || []),
          ].filter((id) => ids.has(id)),
        );
        const rejected = new Set(
          (payload.rejections || [])
            .filter(
              (item) =>
                ![
                  "identity_mismatch",
                  "receipt_capacity",
                  "report_capacity",
                ].includes(item.reason),
            )
            .map((item) => item.id),
        );
        await storage.transact((state) => {
          state.events = state.events.filter((entry) => {
            if (!ids.has(entry.event.id)) return true;
            if (confirmed.has(entry.event.id)) return false;
            if (rejected.has(entry.event.id)) {
              state.dropped++;
              return false;
            }
            entry.nextAt =
              now() +
              Math.max(
                RETRY_MS[Math.min(entry.attempts, RETRY_MS.length - 1)],
                retryAfter || 0,
              );
            entry.attempts++;
            return true;
          });
          prune(state);
        });
        return {
          delivered: confirmed.size > 0,
          acknowledgedIds: [...confirmed],
          reports: payload.reports || {},
        };
      } catch {
        return { delivered: false, acknowledgedIds: [] };
      }
    }
    function flush() {
      if (!flushing)
        flushing = (async () => {
          const combined = {
            delivered: false,
            acknowledgedIds: [],
            reports: {},
          };
          // Drain bounded batches, including a credential change at auth handoff.
          // Every iteration re-reads identity; failed entries retain their backoff.
          for (let batch = 0; batch < 8; batch++) {
            const result = await deliver();
            combined.acknowledgedIds.push(...result.acknowledgedIds);
            Object.assign(combined.reports, result.reports || {});
            combined.delivered ||= result.delivered;
            if (!result.delivered) break;
          }
          return combined;
        })().finally(() => {
          flushing = null;
        });
      return flushing;
    }
    return { enqueue, flush };
  }
  const api = { createQueue };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AutoListerTelemetryCore = api;
})(globalThis);
