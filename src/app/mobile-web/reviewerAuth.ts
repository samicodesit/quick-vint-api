import type { SupabaseClient } from "@supabase/supabase-js";
export const REVIEWER_EMAIL = "chatgpt-review@autolister.app";
export async function signInReviewer(client: SupabaseClient, password: string) {
  const { data: current, error: sessionError } = await client.auth.getSession();
  if (sessionError)
    throw Error("Could not check the current account. Reload to try again.");
  if (current.session) {
    if (current.session.user.email?.toLowerCase() !== REVIEWER_EMAIL)
      throw Error(
        "A different account is signed in. Use a private window for reviewer access.",
      );
    return current.session;
  }
  const { data, error } = await client.auth.signInWithPassword({
    email: REVIEWER_EMAIL,
    password,
  });
  if (
    error ||
    !data.session ||
    data.session.user.email?.toLowerCase() !== REVIEWER_EMAIL
  )
    throw Error("Check the reviewer password and try again.");
  return data.session;
}
