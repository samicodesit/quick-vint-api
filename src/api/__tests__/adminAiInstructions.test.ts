import { beforeEach, describe, expect, it, vi } from "vitest";

const { profileEq, profileUpdate, from } = vi.hoisted(() => {
  const profileEq = vi.fn();
  const profileUpdate = vi.fn(() => ({ eq: profileEq }));
  const from = vi.fn(() => ({ update: profileUpdate }));
  return { profileEq, profileUpdate, from };
});

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { from },
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {};
  }),
}));

import handler from "../../../api/admin/index.js";

function createResponse() {
  const response = {
    statusCode: 200,
    body: null as any,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: any) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

function createRequest(
  aiInstructions: unknown,
  authorization = "Bearer secret",
) {
  return {
    method: "POST",
    query: { action: "set-ai-instructions" },
    headers: { authorization },
    body: { userId: "user-1", aiInstructions },
  } as any;
}

describe("POST /api/admin?action=set-ai-instructions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = "secret";
    profileEq.mockResolvedValue({ error: null });
  });

  it("trims and saves account AI instructions", async () => {
    const res = createResponse();

    await handler(
      createRequest("  Use a persuasive, audience-focused voice.  "),
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      aiInstructions: "Use a persuasive, audience-focused voice.",
      message: "AI instructions saved",
    });
      expect(profileUpdate).toHaveBeenCalledWith({
        ai_instructions: "Use a persuasive, audience-focused voice.",
        ai_style_suggestion: null,
        ai_style_suggestion_reason: null,
    });
    expect(profileEq).toHaveBeenCalledWith("id", "user-1");
  });

  it("stores blank instructions as null", async () => {
    const res = createResponse();

    await handler(createRequest("   "), res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.aiInstructions).toBeNull();
    expect(profileUpdate).toHaveBeenCalledWith({
      ai_instructions: null,
      ai_style_suggestion: null,
      ai_style_suggestion_reason: null,
    });
  });

  it("rejects invalid or oversized instructions without updating the profile", async () => {
    const invalidRes = createResponse();
    const oversizedRes = createResponse();

    await handler(createRequest({ raw: "email" }), invalidRes as any);
    await handler(createRequest("x".repeat(1001)), oversizedRes as any);

    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.body.error).toBe("AI instructions must be plain text.");
    expect(oversizedRes.statusCode).toBe(400);
    expect(oversizedRes.body.error).toBe(
      "AI instructions must be 1000 characters or less.",
    );
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("requires admin authentication", async () => {
    const res = createResponse();

    await handler(
      createRequest("Use persuasive copy.", "Bearer wrong"),
      res as any,
    );

    expect(res.statusCode).toBe(401);
    expect(profileUpdate).not.toHaveBeenCalled();
  });
});
