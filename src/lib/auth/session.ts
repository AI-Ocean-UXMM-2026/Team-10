import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isRecentRecovery } from "./policy";

export async function currentUser() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
}

export async function recoveryAllowed() {
  const supabase = await createClient();
  try {
    const [{ data: userData, error: userError }, { data, error }] = await Promise.all([
      supabase.auth.getUser(), supabase.auth.getClaims(),
    ]);
    return !userError && !error && userData.user?.id === data?.claims.sub && isRecentRecovery(data?.claims);
  } catch {
    return false;
  }
}
