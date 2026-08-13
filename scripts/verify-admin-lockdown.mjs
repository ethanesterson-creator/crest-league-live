// Run this AFTER you've done both manual Supabase steps (created the
// admin@crest-league.internal auth user, and run supabase/harden_admin_access.sql).
// Confirms the lockdown actually works, without ever touching real rows:
// every "write" test targets id = -999, which doesn't exist, so a permitted
// write still changes 0 rows — we're only checking whether it's ALLOWED.
//
// Usage: node scripts/verify-admin-lockdown.mjs <the-admin-password>

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const raw = readFileSync(path.join(root, ".env.local"), "utf8");
  const env = {};
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/verify-admin-lockdown.mjs <the-admin-password>");
  process.exit(1);
}

const env = loadEnv();
const ADMIN_EMAIL = "admin@crest-league.internal";
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function checkWrite(client, label) {
  const { error } = await client.from("app_settings").update({ mode: "league" }).eq("id", -999);
  console.log(`  ${label}: ${error ? `blocked (${error.code ?? error.message})` : "ALLOWED"}`);
  return !error;
}

async function main() {
  console.log("1. Anonymous client — writes to admin-only tables should be BLOCKED:");
  const anonClient = createClient(url, key);
  const anonAllowed = await checkWrite(anonClient, "anon write to app_settings");

  console.log("\n2. Signing in as admin...");
  const authClient = createClient(url, key);
  const { data, error: signInErr } = await authClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password,
  });
  if (signInErr) {
    console.error(`   Sign-in FAILED: ${signInErr.message}`);
    console.error("   Did you create the admin@crest-league.internal user in the Supabase dashboard yet?");
    process.exit(1);
  }
  console.log(`   Signed in OK (user id: ${data.user.id})`);

  console.log("\n3. Authenticated client — writes to admin-only tables should be ALLOWED:");
  const authAllowed = await checkWrite(authClient, "authenticated write to app_settings");

  console.log("\n4. Public reads should still work with NO login (this must not break):");
  const { data: standings, error: readErr } = await anonClient.from("standings").select("team_name").limit(1);
  console.log(`   anon read of standings: ${readErr ? `BROKEN (${readErr.message})` : "OK"}`);

  console.log("\n---");
  if (!anonAllowed && authAllowed && !readErr) {
    console.log("✅ Lockdown is working correctly: anon blocked, admin allowed, public reads intact.");
  } else {
    console.log("⚠️  Something's off — see the lines above. Do not consider this done yet.");
    if (anonAllowed) console.log("   - anon could still write to an admin-only table (RLS not applied?)");
    if (!authAllowed) console.log("   - the signed-in admin couldn't write either (policy scoped wrong?)");
    if (readErr) console.log("   - public reads broke (check the public_read policy exists)");
  }
}

main();
