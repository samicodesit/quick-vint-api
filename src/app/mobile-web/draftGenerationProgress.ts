export const DRAFT_GENERATION_PREPARING = "Preparing your photos…";
export const DRAFT_GENERATION_WAITING = "Still working on your draft…";

export type DraftGenerationPhase = "preparing" | "generating" | "settled";

// The generation API averaged 6.6 seconds across 72 successful web drafts.
const followUpMessages = [
  [2000, "Thinking what the buyers want to read…"],
  [4000, "Writing item description…"],
  [9000, DRAFT_GENERATION_WAITING],
] as const;

export function createDraftGenerationProgress(
  publish: (message: string) => void,
) {
  let timers: ReturnType<typeof setTimeout>[] = [];
  function stopTimers() {
    timers.forEach((timer) => clearTimeout(timer));
    timers = [];
  }
  return {
    setPhase(phase: DraftGenerationPhase) {
      stopTimers();
      if (phase === "preparing") publish(DRAFT_GENERATION_PREPARING);
      if (phase === "generating") {
        publish("Inspecting your item carefully…");
        timers = followUpMessages.map(([ms, message]) =>
          setTimeout(() => publish(message), ms),
        );
      }
    },
    clear() {
      stopTimers();
      publish("");
    },
  };
}
