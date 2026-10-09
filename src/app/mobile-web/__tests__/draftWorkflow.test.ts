import { expect, it } from "vitest";
import {
  DraftAutosave,
  DraftQueue,
  draftGenerationAllowance,
} from "../draftWorkflow";
import type { MobileUsage } from "../generationClient";
import type { Draft } from "../draftContracts";
const draft = {
  id: "draft",
  title: "",
  description: "",
  version: 1,
  settings: {},
  input_version: 1,
} as Draft;
it("serializes autosaves and retains edits made while a save is in flight", async () => {
  let finish!: (v: Draft) => void;
  const sent: any[] = [];
  const autosave = new DraftAutosave(
    draft,
    async (value) => {
      sent.push(value);
      if (sent.length === 1)
        return new Promise<Draft>((r) => {
          finish = r;
        });
      return { ...draft, ...value, version: 3 };
    },
    () => {},
  );
  autosave.edit({ title: "First" });
  const flushing = autosave.flush();
  autosave.edit({ description: "During save" });
  finish({ ...draft, title: "First", version: 2 });
  await flushing;
  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({
    expectedVersion: 2,
    title: "First",
    description: "During save",
  });
  expect(autosave.dirty).toBe(false);
});
it("keeps failed edits dirty for recovery and blocks accidental overwrite", async () => {
  const autosave = new DraftAutosave(
    draft,
    async () => {
      throw Object.assign(new Error("Conflict"), { code: "draft_conflict" });
    },
    () => {},
  );
  autosave.edit({ title: "Keep me" });
  await expect(autosave.flush()).rejects.toThrow("Conflict");
  expect(autosave.dirty).toBe(true);
  expect(autosave.value.title).toBe("Keep me");
});
it("retains the confirmed state until a Listed save succeeds", async () => {
  let fail = true;
  const autosave = new DraftAutosave(
    { ...draft, state: "draft" },
    async (input) => {
      if (fail) throw new Error("Unavailable");
      return { ...draft, ...input, version: 2 };
    },
    () => {},
  );
  autosave.edit({ state: "done" });
  await expect(autosave.flush()).rejects.toThrow("Unavailable");
  expect(autosave.savedState).toBe("draft");
  expect(autosave.value.state).toBe("done");
  fail = false;
  await autosave.flush();
  expect(autosave.savedState).toBe("done");
});
it("restores the original saved version so another device's newer edits require a conflict choice", async () => {
  let attemptedVersion = 0;
  const autosave = new DraftAutosave(
    { ...draft, version: 2 },
    async (input) => {
      attemptedVersion = input.expectedVersion;
      if (input.expectedVersion !== 2) throw new Error("Conflict");
      return { ...draft, ...input, version: 3 };
    },
    () => {},
  );
  autosave.restore({ ...draft, title: "Old tab edits" }, 1);
  await expect(autosave.flush()).rejects.toThrow("Conflict");
  expect(attemptedVersion).toBe(1);
  expect(autosave.savedVersion).toBe(1);
  expect(autosave.value.title).toBe("Old tab edits");
  expect(autosave.dirty).toBe(true);
});
it("pauses after the active item and isolates item failures", async () => {
  const attempted: string[] = [];
  const queue = new DraftQueue(
    async (id) => {
      attempted.push(id);
      if (id === "a") queue.pause();
    },
    () => {},
  );
  await queue.start(["a", "b"]);
  expect(attempted).toEqual(["a"]);
  expect(queue.remaining).toEqual(["b"]);
  await queue.resume();
  expect(attempted).toEqual(["a", "b"]);
  const failed = new DraftQueue(
    async (id) => {
      if (id === "bad") throw new Error("Upload unavailable");
    },
    () => {},
  );
  await failed.start(["bad", "good"]);
  expect(failed.failed.get("bad")).toBe("Upload unavailable");
  expect(failed.completed).toEqual(["good"]);
});
it("stops the queue on quota exhaustion or an uncertain result", async () => {
  for (const failure of [
    { status: 429 },
    { code: "generation_commit_pending" },
    { code: "network_error" },
  ]) {
    const queue = new DraftQueue(
      async () => {
        throw Object.assign(new Error("Check before retrying"), failure);
      },
      () => {},
    );
    await queue.start(["first", "second"]);
    expect(queue.remaining).toEqual(["second"]);
    expect(queue.paused).toBe(true);
  }
});
it("checks the server allowance and minute reset before resuming a batch", async () => {
  const usage = {
    canGenerate: true,
    remaining: { generations: 2, minute: 0 },
    resetsAt: { minute: new Date(Date.now() + 30000).toISOString() },
  } as MobileUsage;
  expect(() => draftGenerationAllowance(usage)).toThrow(/Try again in/);
  expect(
    draftGenerationAllowance({
      ...usage,
      remaining: { ...usage.remaining, minute: 1 },
    }),
  ).toBe(2);
  expect(() => draftGenerationAllowance(null)).toThrow(/could not be checked/);
  const attempted: string[] = [];
  const queue = new DraftQueue(
    async (id) => {
      attempted.push(id);
    },
    () => {},
  );
  queue.remaining = ["a", "b", "c"];
  await queue.resume(2);
  expect(attempted).toEqual(["a", "b"]);
  expect(queue.remaining).toEqual(["c"]);
  expect(queue.paused).toBe(true);
});
