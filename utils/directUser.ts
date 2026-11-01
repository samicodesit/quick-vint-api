import { supabase } from "./supabaseClient";
import { isOAuthToken } from "./chatgptAuth";

export async function getDirectUser(token: string) {
  if (isOAuthToken(token)) {
    return {
      data: { user: null },
      error: new Error("Use AutoLister directly for this action."),
    };
  }
  return supabase.auth.getUser(token);
}
