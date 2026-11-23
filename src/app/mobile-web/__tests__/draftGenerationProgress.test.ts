import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDraftGenerationProgress } from "../draftGenerationProgress";
import { uiText } from "../ui";
import { UI_LOCALES } from "../uiCopy";

const messages = [
  "Preparing your photos…",
  "Inspecting your item carefully…",
  "Thinking what the buyers want to read…",
  "Writing item description…",
  "Still working on your draft…",
];

describe("draft generation progress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("times messages from generation, not photo preparation", () => {
    const publish = vi.fn();
    const progress = createDraftGenerationProgress(publish);
    progress.setPhase("preparing");
    vi.advanceTimersByTime(4000);
    progress.setPhase("generating");
    vi.advanceTimersByTime(1999);
    expect(publish.mock.calls.flat()).toEqual(messages.slice(0, 2));
    vi.advanceTimersByTime(1);
    expect(publish.mock.calls.flat()).toEqual(messages.slice(0, 3));
    vi.advanceTimersByTime(2000);
    expect(publish.mock.calls.flat()).toEqual(messages.slice(0, 4));
    vi.advanceTimersByTime(5000);
    expect(publish.mock.calls.flat()).toEqual(messages);
  });

  it("stops on API settlement and starts over for a retry", () => {
    const publish = vi.fn();
    const progress = createDraftGenerationProgress(publish);
    progress.setPhase("generating");
    vi.advanceTimersByTime(500);
    progress.setPhase("settled");
    vi.advanceTimersByTime(10000);
    expect(publish.mock.calls.flat()).toEqual([messages[1]]);
    progress.clear();
    progress.setPhase("preparing");
    progress.setPhase("generating");
    vi.advanceTimersByTime(2000);
    progress.clear();
    vi.advanceTimersByTime(10000);
    expect(publish.mock.calls.flat()).toEqual([
      messages[1],
      "",
      messages[0],
      messages[1],
      messages[2],
      "",
    ]);
  });

  it.each(UI_LOCALES.filter((locale) => locale !== "en"))(
    "translates every message in %s",
    (locale) => {
      for (const message of messages)
        expect(uiText(message, locale)).not.toBe(message);
    },
  );
});
