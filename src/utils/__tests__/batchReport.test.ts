import { expect, it } from "vitest";
import { batchReports } from "../../../utils/incidents/batchReport";

const flow = {
  operation_id: "batch-a",
  user_id: "owner",
  identity_verified: true,
};
function row(
  event: string,
  occurredAt: string,
  context: any = {},
  owner = "owner",
  client = "client-a",
) {
  return {
    id: `${event}-${occurredAt}`,
    user_id: owner,
    created_at: occurredAt,
    full_request_body: {
      event,
      occurredAt,
      source: "extension_background",
      extensionVersion: "1.4.24",
      context: { batchId: "batch-a", analyticsClientId: client, ...context },
    },
  };
}
it("shows exact pause counts, elapsed duration and a matched manual recovery", () => {
  const rows = [
    row("batch_paused", "2026-10-21T10:01:00Z", {
      errorCode: "HOST_PHOTO_CONFIRMATION_TIMEOUT",
      expectedPhotoCount: 10,
      confirmedPhotoCount: 8,
      durationMs: 60000,
      completedCount: 2,
      total: 4,
    }),
    row("batch_complete", "2026-10-21T10:05:00Z", {
      completedCount: 4,
      total: 4,
      recoveryAgeMs: 300000,
      pauseDurationMs: 120000,
      activeDurationMs: 180000,
      timingComplete: true,
      resumeTrigger: "user_resume",
      resumeCount: 1,
    }),
  ];
  const [report] = batchReports([flow], rows, false);
  expect(report.recoveryStatus).toBe("recovered");
  expect(report.pauses[0]).toMatchObject({
    expectedPhotoCount: 10,
    confirmedPhotoCount: 8,
    durationMs: 60000,
  });
  expect(report.completion).toMatchObject({
    recoveryAgeMs: 300000,
    resumeTrigger: "user_resume",
    completedCount: 4,
  });
});
it("cannot borrow completion from another account or browser, or from a Generate success", () => {
  const pause = row("batch_paused", "2026-10-21T10:01:00Z");
  for (const wrong of [
    row(
      "batch_complete",
      "2026-10-21T10:02:00Z",
      { completedCount: 4, total: 4 },
      "other",
    ),
    row(
      "batch_complete",
      "2026-10-21T10:02:00Z",
      { completedCount: 4, total: 4 },
      "owner",
      "other-client",
    ),
    row("generate_success", "2026-10-21T10:02:00Z", {
      completedCount: 4,
      total: 4,
    }),
  ]) {
    expect(batchReports([flow], [pause, wrong], false)[0].recoveryStatus).toBe(
      "unproven",
    );
  }
});
it("keeps a later pause open and makes missing or truncated evidence explicit", () => {
  const rows = [
    row("batch_complete", "2026-10-21T10:02:00Z", {
      completedCount: 4,
      total: 4,
    }),
    row("batch_paused", "2026-10-21T10:03:00Z"),
  ];
  expect(batchReports([flow], rows, false)[0].recoveryStatus).toBe("unproven");
  expect(batchReports([flow], [], true)[0]).toMatchObject({
    recoveryStatus: "unproven",
    incomplete: true,
  });
});
it("shows one interruption when content and background report the same pause, while retaining recurrence", () => {
  const first = row("batch_paused", "2026-10-21T10:01:00Z", {
    pauseCount: 1,
    itemIndex: 3,
  });
  const duplicate = row("batch_paused", "2026-10-21T10:01:02Z", {
    pauseCount: 1,
    itemIndex: 3,
  });
  duplicate.full_request_body.source = "extension_content";
  const later = row("batch_paused", "2026-10-21T10:04:00Z", {
    pauseCount: 2,
    itemIndex: 3,
  });
  const [report] = batchReports([flow], [first, duplicate, later], false);
  expect(report.pauses).toHaveLength(2);
  expect(report.events).toHaveLength(3);
  expect(report.recoveryStatus).toBe("unproven");
});
