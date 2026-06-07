import { randomUUID } from "node:crypto";
import { createClient, type Session } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Database } from "@/db/database.types";

export interface SeededAccount {
  email: string;
  password: string;
  userId: string;
  session: Session;
}

const PASSWORD = "vena-test-password-1234!";

/** `SUPABASE_URL`/`SUPABASE_KEY` resolve to the local stack inside Vitest (verified in Phase 1). */
function localStackClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_KEY must resolve to the local Supabase stack inside Vitest");
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Creates a real, disposable account on the local Supabase stack (unique
 * email — no explicit cleanup, the local instance is itself disposable) and
 * seeds a *complete* profile (`sex` set) using the account's own session, so
 * the post-login chain deterministically takes the 2-hop path
 * (`signin` → `/donations`) rather than the 3-hop profile-incomplete path
 * (`signin` → `/donations` → `/profile`, `middleware.ts:26-30`).
 */
export async function createSeededAccount(): Promise<SeededAccount> {
  const email = `vena-test-${randomUUID()}@example.com`;
  const client = localStackClient();

  const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password: PASSWORD });
  if (signUpError || !signUpData.user || !signUpData.session) {
    throw new Error(`Failed to seed throwaway account: ${signUpError?.message ?? "no session returned"}`);
  }

  // The account's own authenticated client — relies on `profiles_insert_own`
  // RLS, the same write path `/api/profile` uses. No service-role key needed.
  const { error: insertError } = await client.from("profiles").insert({
    user_id: signUpData.user.id,
    sex: "male",
  });
  if (insertError) {
    throw new Error(`Failed to seed profile for throwaway account: ${insertError.message}`);
  }

  return {
    email,
    password: PASSWORD,
    userId: signUpData.user.id,
    session: signUpData.session,
  };
}
