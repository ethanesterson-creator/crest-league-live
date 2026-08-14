// Run this AFTER you've done both manual Supabase steps (created the
// admin@crest-league.internal auth user, and run supabase/harden_admin_access.sql).
// Confirms the lockdown actually works.
//
// Tests with a real INSERT into `points_rules` (a small, low-traffic table
// nothing in the app writes to at runtime) using an obviously-fake
// league_id, then deletes that row immediately with the authenticated
// client regardless of which attempt created it -- nothing is left behind
// either way. An earlier version of this script tested UPDATE against a
// nonexistent id specifically to avoid touching real rows, but that made
// the test meaningless: a WHERE clause matching zero rows "succeeds" with
// nothing changed whether or not RLS would have blocked a real row, so it
// couldn't actually distinguish "blocked" from "nothing to block."
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

const ANON_TEST_ID = "__verify_lockdown_test_anon__";
const AUTH_TEST_ID = "__verify_lockdown_test_auth__";

async function attemptInsert(client, id) {
  return client.from("leagues").insert({ id, name: "Verify Test" });
}

// Distinguish "RLS actually blocked this" from any other kind of error
// (bad payload, network issue, etc.) so a misleading result never gets
// reported as a clean pass or fail.
function classify(error) {
  if (!error) return "ALLOWED";
  const msg = String(error.message || "").toLowerCase();
  if (error.code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) {
    return "blocked (RLS)";
  }
  return `INCONCLUSIVE — unexpected error, not an RLS denial: ${error.code ?? ""} ${error.message}`;
}

async function main() {
  console.log("1. Anonymous client — insert into an admin-only table should be BLOCKED:");
  const anonClient = createClient(url, key);
  const { error: anonErr } = await attemptInsert(anonClient, ANON_TEST_ID);
  const anonResult = classify(anonErr);
  console.log(`   anon insert into leagues: ${anonResult}`);

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

  console.log("\n3. Authenticated client — insert into an admin-only table should be ALLOWED:");
  const { error: authErr } = await attemptInsert(authClient, AUTH_TEST_ID);
  const authResult = classify(authErr);
  console.log(`   authenticated insert into leagues: ${authResult}`);

  console.log("\n   Cleaning up any test rows (via the authenticated client, which can delete)...");
  const { error: cleanupErr } = await authClient.from("leagues").delete().in("id", [ANON_TEST_ID, AUTH_TEST_ID]);
  console.log(cleanupErr
    ? `   ⚠️ Cleanup failed — manually delete leagues rows with id in ('${ANON_TEST_ID}', '${AUTH_TEST_ID}'): ${cleanupErr.message}`
    : "   Cleaned up.");

  console.log("\n4. Public reads should still work with NO login (this must not break):");
  const { error: readErr } = await anonClient.from("standings").select("team_name").limit(1);
  console.log(`   anon read of standings: ${readErr ? `BROKEN (${readErr.message})` : "OK"}`);

  console.log("\n---");
  const anonBlocked = anonResult.startsWith("blocked");
  const authAllowed = authResult === "ALLOWED";
  if (anonBlocked && authAllowed && !readErr) {
    console.log("✅ Lockdown is working correctly: anon blocked, admin allowed, public reads intact.");
  } else {
    console.log("⚠️  Something's off — see the lines above. Do not consider this done yet.");
    if (!anonBlocked) console.log(`   - anon's insert was NOT cleanly blocked (${anonResult})`);
    if (!authAllowed) console.log(`   - the signed-in admin's insert was NOT cleanly allowed (${authResult})`);
    if (readErr) console.log("   - public reads broke (check the public_read policy exists)");
  }
}

main();
