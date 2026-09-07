import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  from: vi.fn(),
  update: vi.fn(),
  suggest: vi.fn(),
  logRequests: vi.fn(),
}));
vi.mock("resend", () => ({ Resend: class {} }));
vi.mock("../../../utils/aiStyleLearner", () => ({
  suggestAiStyle: mocks.suggest,
}));
vi.mock("../../../utils/duplicateIpAutoPause", () => ({
  detectAndPauseDuplicateIpAccount: vi.fn(),
}));
vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: () => ({}),
    logRequests: mocks.logRequests,
    logRequest: vi.fn(),
  },
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: { id: "seller-1", email: "seller@example.com" } },
      }),
    },
    from: mocks.from,
  },
}));
import handler from "../../../api/events/track";

async function editedListing() {
  const req = {
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: {
      event: "generation_output_edited",
      page: "/items/new",
      plan: "free",
      context: {
        generationAttemptId: "attempt-1",
        generatedTitle: "Blue shirt",
        generatedDescription: "A blue shirt.",
        finalTitle: "Blue shirt",
        finalDescription: "Blue shirt\nSize M",
      },
    },
  } as any;
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn(),
    end: vi.fn(),
  };
  await handler(req, res as any);
  expect(res.statusCode).toBe(204);
  expect(mocks.logRequests).toHaveBeenCalledOnce();
}

describe("event endpoint style learning cost boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile = {
      email: "seller@example.com",
      subscription_status: "free",
      subscription_tier: "free",
      free_lifetime_generations_used: 1,
      ai_instructions: "Keep it concise",
      ai_style_learning_state: {},
    };
    const query: any = {};
    for (const key of ["select", "eq", "gte", "order"])
      query[key] = vi.fn(() => query);
    query.maybeSingle = async () => ({ data: mocks.profile, error: null });
    query.limit = async () => ({ data: [], error: null });
    query.update = mocks.update.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.suggest.mockResolvedValue({
      aiInstructions: "Use short lines",
      reason: "Formatting preference",
    });
  });

  it.each(["starter", "pro", "business"])(
    "does not learn or mutate %s profiles, even when the event claims free",
    async (tier) => {
      mocks.profile.subscription_status = "active";
      mocks.profile.subscription_tier = tier;
      await editedListing();
      expect(mocks.suggest).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
        "profiles",
      ]);
    },
  );

  it("keeps free trial learning and applies the learned instructions", async () => {
    await editedListing();
    expect(mocks.suggest).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ ai_instructions: "Use short lines" }),
    );
  });

  it("does not spend a learning call after the free trial is exhausted", async () => {
    mocks.profile.free_lifetime_generations_used = 5;
    await editedListing();
    expect(mocks.suggest).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not re-analyze an already learned free edit", async () => {
    mocks.profile.ai_style_learning_state = {
      analyzedAttemptIds: ["attempt-1"],
    };
    await editedListing();
    expect(mocks.suggest).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
