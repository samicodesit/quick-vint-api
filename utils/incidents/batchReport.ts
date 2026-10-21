// Read-only presentation of existing batch events. No incident or product state changes.
export const batchEvidenceEvents = [
  "batch_start",
  "batch_resume_started",
  "batch_paused",
  "batch_complete",
  "batch_done",
  "batch_cancelled",
  "batch_failed",
];
export function retainsBatchEvidence(raw: any) {
  return (
    batchEvidenceEvents.includes(raw.event) ||
    (raw.event === "batch_worker_progress" &&
      raw.context?.phase === "worker_reattached")
  );
}
export function batchReports(flows: any[], rows: any[], incomplete: boolean) {
  return flows
    .filter((flow) => flow.identity_verified && flow.user_id)
    .map((flow) => {
      const seen = new Set<string>();
      const events = rows
        .filter(
          (row) =>
            row.user_id === flow.user_id &&
            row.full_request_body?.context?.batchId === flow.operation_id,
        )
        .map((row) => {
          const body = row.full_request_body;
          return {
            ...body.context,
            event: body.event,
            source: body.source,
            logId: row.id,
            transportEventId: body.transportEventId,
            occurredAt: body.occurredAt || row.created_at,
            receivedAt: row.created_at,
            clientVersion: body.extensionVersion,
          };
        })
        .filter((event) => {
          const key = event.transportEventId || event.logId;
          if (seen.has(key) || !Number.isFinite(Date.parse(event.occurredAt)))
            return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
      const pauseKeys = new Set<string>();
      const pauses = events.filter((event) => {
        if (
          !["batch_paused", "batch_failed", "batch_cancelled"].includes(
            event.event,
          )
        )
          return false;
        // A late controller reply can duplicate the worker's fallback event.
        // Keep both source records, but present one numbered interruption.
        if (
          !Number.isInteger(event.pauseCount) ||
          event.pauseCount <= 0 ||
          !event.analyticsClientId
        )
          return true;
        const key = JSON.stringify([
          event.analyticsClientId,
          event.event,
          event.pauseCount,
        ]);
        if (pauseKeys.has(key)) return false;
        pauseKeys.add(key);
        return true;
      });
      const latestPause = pauses.at(-1);
      const completion = events
        .filter(
          (event) =>
            ["batch_complete", "batch_done"].includes(event.event) &&
            Number.isInteger(event.total) &&
            event.total > 0 &&
            event.completedCount === event.total &&
            typeof event.analyticsClientId === "string" &&
            event.analyticsClientId.length > 0 &&
            (!latestPause ||
              (event.analyticsClientId === latestPause.analyticsClientId &&
                Date.parse(event.occurredAt) >
                  Date.parse(latestPause.occurredAt))),
        )
        .at(-1);
      return {
        batchId: flow.operation_id,
        recoveryStatus: completion
          ? pauses.length
            ? "recovered"
            : "completed"
          : "unproven",
        pauses,
        completion: completion || null,
        events,
        incomplete,
        evidenceAvailable: events.length > 0,
      };
    });
}
