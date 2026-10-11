/* Durable transport mechanics. This file is also distributed with the website. */
(function (root) {
  "use strict";
  const bytes = (value) =>
    new TextEncoder().encode(JSON.stringify(value)).length;
  const RETRY_MS = [60000, 300000, 900000, 1800000];
  function createQueue({ storage, identity, send, now = Date.now }) {
    let flushing;
    let flushRequested = false;
    function recordDrop(state, entry, reason, rejection) {
      state.dropped++;
      state.dropCounts ||= {};
      const counts = state.dropCounts;
      counts[reason] = (counts[reason] || 0) + 1;
      if (entry.critical) counts.critical = (counts.critical || 0) + 1;
      if (entry.event.event === "listing_report_submitted")
        counts.customerReports = (counts.customerReports || 0) + 1;
      if (rejection)
        counts.lastRejection = /^[a-z_]{1,80}$/.test(rejection)
          ? rejection
          : "unknown_rejection";
    }
    function prune(state) {
      state.events ||= [];
      state.dropped ||= 0;
      // An older tab can report/reset the shared total without knowing these
      // counters. Discard stale classification instead of attributing it again.
      const counts = state.dropCounts;
      if (
        counts &&
        (counts.expired || 0) +
          (counts.capacity || 0) +
          (counts.rejected || 0) >
          state.dropped
      )
        delete state.dropCounts;
      state.events = state.events.filter((item) => {
        if (now() - item.createdAt < 86400000) return true;
        recordDrop(state, item, "expired");
        return false;
      });
      while (state.events.length > 200 || bytes(state) > 524288) {
        const routine = state.events.findIndex((item) => !item.critical);
        const [entry] = state.events.splice(routine < 0 ? 0 : routine, 1);
        recordDrop(state, entry, "capacity");
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
              const counts = state.dropCounts || {};
              entry.event.context = {
                ...entry.event.context,
                queueDropped: state.dropped,
                queueDroppedExpired: counts.expired || 0,
                queueDroppedCapacity: counts.capacity || 0,
                queueDroppedRejected: counts.rejected || 0,
                // Older queues contain only the total. Zero known critical
                // drops must not be mistaken for proof those records were routine.
                queueDroppedUnclassified: Math.max(
                  0,
                  state.dropped -
                    (counts.expired || 0) -
                    (counts.capacity || 0) -
                    (counts.rejected || 0),
                ),
                queueDroppedCritical: counts.critical || 0,
                queueDroppedCustomerReports: counts.customerReports || 0,
                ...(counts.lastRejection
                  ? { queueDropLastRejection: counts.lastRejection }
                  : {}),
              };
              state.dropped = 0;
              delete state.dropCounts;
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
        const rejected = new Map(
          (payload.rejections || [])
            .filter(
              (item) =>
                ![
                  "identity_mismatch",
                  "receipt_capacity",
                  "report_capacity",
                ].includes(item.reason),
            )
            .map((item) => [item.id, item.reason]),
        );
        await storage.transact((state) => {
          state.events = state.events.filter((entry) => {
            if (!ids.has(entry.event.id)) return true;
            if (confirmed.has(entry.event.id)) return false;
            if (rejected.has(entry.event.id)) {
              recordDrop(
                state,
                entry,
                "rejected",
                rejected.get(entry.event.id),
              );
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
      if (flushing) {
        // An auth/activity signal may arrive after the active flush read its
        // identity or queue. Preserve it instead of silently joining stale work.
        flushRequested = true;
        return flushing;
      }
      if (!flushing)
        flushing = (async () => {
          const combined = {
            delivered: false,
            acknowledgedIds: [],
            reports: {},
          };
          // Drain bounded batches, including a credential change at auth handoff.
          // Every iteration re-reads identity; failed entries retain their backoff.
          try {
            for (let batch = 0; batch < 8; batch++) {
              flushRequested = false;
              const result = await deliver();
              combined.acknowledgedIds.push(...result.acknowledgedIds);
              Object.assign(combined.reports, result.reports || {});
              combined.delivered ||= result.delivered;
              if (!result.delivered && !flushRequested) break;
            }
            return combined;
          } finally {
            flushing = null;
          }
        })();
      return flushing;
    }
    return { enqueue, flush };
  }
  const api = { createQueue };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AutoListerTelemetryCore = api;
})(globalThis);
