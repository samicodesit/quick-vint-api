import type { Draft } from "./draftContracts";
import type { LocalDraftStore } from "./localDraftStore";
import { sendResultEdit } from "./resultEditTracking";

/** No key listeners or polling. Existing successful local saves schedule a checkpoint. */
export function trackSavedDrafts(store: LocalDraftStore) {
  const observed = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;
  const checkpoint = async (id: string, kind: "visible" | "idle" | "leave") => {
    if (closed) return;
    try {
      const context = await store.claimEditObservation(id, kind);
      if (context && !closed)
        await sendResultEdit(
          store.userId,
          context,
          kind === "visible"
            ? "generation_output_visible"
            : "generation_output_edited",
        );
    } catch {
      /* Tracking must never interrupt a draft save. */
    }
  };
  return {
    observe(draft: Draft) {
      if (
        closed ||
        !draft.operation_id ||
        draft.operation_state !== "succeeded" ||
        observed.has(draft.operation_id)
      )
        return;
      observed.add(draft.operation_id);
      void checkpoint(draft.id, "visible");
    },
    saved(draft: Draft) {
      if (closed || !draft.operation_id || !observed.has(draft.operation_id))
        return;
      const id = draft.id;
      clearTimeout(timers.get(id));
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          void checkpoint(id, "idle");
        }, 20000),
      );
    },
    leave(id: string) {
      clearTimeout(timers.get(id));
      timers.delete(id);
      void checkpoint(id, "leave");
    },
    dispose() {
      closed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      observed.clear();
    },
  };
}
