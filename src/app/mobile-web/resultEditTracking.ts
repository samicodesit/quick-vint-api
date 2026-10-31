import { fetchMobileJson } from "./api";

export async function sendResultEdit(
  owner: string,
  context: Record<string, unknown>,
) {
  // Refresh the identity from the session store on every checkpoint. Analytics
  // must never sign a seller out or persist private copy for a future login.
  const event = {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    event: "generation_output_edited",
    accountId: owner,
    source: "mobile_web",
    page: "/app",
    context,
  };
  const body = JSON.stringify({ schemaVersion: 2, events: [event] });
  if (new Blob([body]).size > 48 * 1024) return;
  await fetchMobileJson(
    "/api/events/track",
    {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
    },
    { expectedUserId: owner, retryOn401: false },
  );
}

// Keep drafts in memory. Send a bounded snapshot only when the wording actually changed.
type Copy = { title: string; description: string };
export function trackResultEdits(
  original: Copy,
  generationAttemptId: string,
  emit: (context: Record<string, unknown>) => void,
) {
  const fields = ["title", "description"] as const;
  const current: Copy = {
    title: original.title,
    description: original.description,
  };
  let previous = { ...current };
  let sequence = 0;
  let closed = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const flush = (reason: string, terminal = false) => {
    if (
      closed ||
      sequence >= (terminal ? 3 : 2) ||
      fields.every((f) => previous[f] === current[f])
    )
      return;
    const context: Record<string, unknown> = {
      generationAttemptId,
      mode: "mobile_result",
      editSequence: ++sequence,
      editSnapshotReason: reason,
      summaryLimit: 3,
    };
    for (const f of fields) {
      const changed = current[f] !== original[f];
      context[f + "Changed"] = changed;
      context[f + "LengthDelta"] = current[f].length - original[f].length;
      // Larger fields still count as edits. Never send a silently clipped example.
      if (changed && original[f].length <= 6000 && current[f].length <= 6000) {
        const name = f === "title" ? "Title" : "Description";
        context["generated" + name] = original[f];
        context["final" + name] = current[f];
      }
    }
    previous = { ...current };
    emit(context);
  };
  const close = (reason: string) => {
    if (closed) return;
    clearTimeout(idle);
    clearTimeout(expiry);
    if (reason !== "account_changed") flush(reason, true);
    closed = true;
  };
  const expiry = setTimeout(() => close("expired"), 5 * 60000);
  return {
    edit(field: keyof Copy, value: string) {
      if (closed || current[field] === value) return;
      current[field] = value;
      clearTimeout(idle);
      idle = setTimeout(() => flush("idle"), 20000);
    },
    flush,
    close,
  };
}
