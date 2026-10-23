"use client";

import { createBrowserClient } from "@supabase/ssr";
import { cookieOptions, supabaseConfig } from "./config";

export function createClient() {
  const { url, key } = supabaseConfig();
  return createBrowserClient(url, key, { cookieOptions });
}
