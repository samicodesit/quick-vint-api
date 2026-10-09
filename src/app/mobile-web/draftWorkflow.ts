import type { Draft } from "./draftContracts";
import type { MobileUsage } from "./generationClient";

export function draftGenerationAllowance(usage: MobileUsage | null): number {
  if (!usage)
    throw new Error(
      "Your usage could not be checked. Try again before generating.",
    );
  const reset = Date.parse(
    typeof usage.resetsAt?.minute === "string" ? usage.resetsAt.minute : "",
  );
  if (usage.remaining?.minute === 0 && reset > Date.now())
    throw new Error(
      `Please wait before generating more items. Try again in ${Math.ceil((reset - Date.now()) / 1000)} seconds. Your drafts are saved.`,
    );
  if (usage.canGenerate === false)
    throw new Error(
      "You have reached your current generation limit. Your drafts are still saved.",
    );
  const available = usage.remaining?.generations;
  if (
    typeof available !== "number" ||
    !Number.isSafeInteger(available) ||
    available < 0
  )
    throw new Error(
      "Your generation allowance could not be checked. Try again.",
    );
  if (!available)
    throw new Error(
      "You have no generations left in your current allowance. Your drafts are still saved.",
    );
  return available;
}

type Edits = Pick<Draft, "title" | "description" | "settings" | "state">;
export class DraftAutosave {
  value: Draft;
  dirty = false;
  private revision = 0;
  private saved: Draft;
  private pending?: Promise<void>;
  constructor(
    draft: Draft,
    private save: (
      input: Edits & { draftId: string; expectedVersion: number },
    ) => Promise<Draft>,
    private status: (value: "saving" | "saved" | "error") => void,
  ) {
    this.value = draft;
    this.saved = draft;
  }
  edit(edits: Partial<Edits>) {
    this.value = { ...this.value, ...edits };
    this.dirty = true;
    this.revision++;
  }
  get savedVersion() {
    return this.saved.version;
  }
  restore(edits: Edits, baseVersion: number) {
    this.saved = { ...this.saved, version: baseVersion };
    this.edit(edits);
  }
  flush(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.persist().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async persist() {
    try {
      while (this.dirty) {
        this.status("saving");
        const revision = this.revision;
        const value = this.value;
        const saved = await this.save({
          draftId: value.id,
          expectedVersion: this.saved.version,
          title: value.title,
          description: value.description,
          settings: value.settings,
          state: value.state,
        });
        this.saved = saved;
        this.value =
          revision === this.revision
            ? saved
            : {
                ...saved,
                title: this.value.title,
                description: this.value.description,
                settings: this.value.settings,
                state: this.value.state,
              };
        this.dirty = revision !== this.revision;
      }
      this.status("saved");
    } catch (error) {
      this.status("error");
      throw error;
    }
  }
}

export class DraftQueue {
  active: string | null = null;
  remaining: string[] = [];
  completed: string[] = [];
  failed = new Map<string, string>();
  running = false;
  paused = false;
  constructor(
    private generate: (id: string) => Promise<void>,
    private changed: () => void,
  ) {}
  async start(ids: string[]) {
    if (this.running) throw new Error("A batch is already running.");
    if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length)
      throw new Error("Choose between 1 and 20 items.");
    this.remaining = [...ids];
    this.completed = [];
    this.failed.clear();
    await this.resume();
  }
  pause() {
    this.paused = true;
    this.changed();
  }
  async resume(limit = 20) {
    if (this.running) return;
    this.paused = false;
    this.running = true;
    this.changed();
    try {
      let attempted = 0;
      while (this.remaining.length && !this.paused && attempted < limit) {
        this.active = this.remaining.shift()!;
        this.changed();
        try {
          await this.generate(this.active);
          this.completed.push(this.active);
        } catch (error) {
          this.failed.set(
            this.active,
            error instanceof Error
              ? error.message
              : "This item could not be generated.",
          );
          const details = error as { status?: number; code?: string };
          if (
            details.status === 401 ||
            details.status === 429 ||
            [
              "generation_in_progress",
              "generation_commit_pending",
              "network_error",
            ].includes(details.code || "")
          )
            this.paused = true;
        }
        this.active = null;
        attempted++;
        this.changed();
      }
      if (this.remaining.length) this.paused = true;
    } finally {
      this.active = null;
      this.running = false;
      this.changed();
    }
  }
}
