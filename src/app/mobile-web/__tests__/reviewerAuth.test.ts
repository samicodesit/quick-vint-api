import { expect, it, vi } from "vitest";
import { signInReviewer } from "../reviewerAuth";
const email = "chatgpt-review@autolister.app";
it("does not replace an existing different account", async () => {
  const auth = {
    getSession: vi.fn(async () => ({
      data: { session: { user: { email: "customer@example.com" } } },
    })),
    signInWithPassword: vi.fn(),
  };
  await expect(signInReviewer({ auth } as any, "password")).rejects.toThrow(
    "private window",
  );
  expect(auth.signInWithPassword).not.toHaveBeenCalled();
});
it("uses ordinary password auth for only the dedicated reviewer", async () => {
  const session = { user: { email }, access_token: "ordinary-token" };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    signInWithPassword: vi.fn(async () => ({ data: { session }, error: null })),
  };
  expect(await signInReviewer({ auth } as any, "password")).toBe(session);
  expect(auth.signInWithPassword).toHaveBeenCalledWith({
    email,
    password: "password",
  });
});
it("does not expose provider details on failed sign-in", async () => {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    signInWithPassword: vi.fn(async () => ({
      data: { session: null },
      error: new Error("internal secret"),
    })),
  };
  await expect(signInReviewer({ auth } as any, "wrong")).rejects.toThrow(
    "Check the reviewer password",
  );
});
