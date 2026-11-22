// Loads (or resets) demo data for one coach account from the command line.
// Usage: npm run demo:reset -- coach@example.com password
import { createClient } from "@supabase/supabase-js";

import { loadDemoDataWithClipCleanup } from "../src/lib/reset-demo-data.mjs";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: npm run demo:reset -- <coach-email> <password>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
if (loginError) {
  console.error(`Login failed: ${loginError.message}`);
  process.exit(1);
}

const started = Date.now();
const { data, error, clipError } = await loadDemoDataWithClipCleanup(supabase, true);
if (error) {
  console.error(`Loading demo data failed: ${error.message}`);
  process.exit(1);
}
console.log(`Demo data loaded in ${((Date.now() - started) / 1000).toFixed(1)}s:`, data);
if (clipError) {
  console.error("The demo was reset, but some uploaded movement clips couldn't be removed.");
  process.exitCode = 1;
}
