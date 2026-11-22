import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const config = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.ok(["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname), "LOCAL Supabase only");
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const js = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (id) => id === "@/lib/time-zone" ? { getToday: async () => today } : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(path.resolve(path.dirname(filename), `${id}.ts`)) : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
function check(result) { if (result.error) throw result.error; return result.data; }
const users = [];
try {
  const password = randomUUID();
  const email = `draft-local-${randomUUID()}@test.local`;
  const user = check(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
  users.push(user.id);
  const db = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
  check(await db.auth.signInWithPassword({ email, password }));
  const athlete = check(await db.from("athletes").insert({ first_name: "Alex", last_name: "Local draft test", birth_date: "1995-01-01", experience_level: "beginner", injuries: "Mild shoulder discomfort; avoid overhead work." }).select("id").single());
  const { SUGGESTION_REGISTRY } = load("src/lib/ai/suggestions.ts");
  const withoutIntake = await SUGGESTION_REGISTRY.adjust_macros.buildRequest(db, { athleteId: athlete.id });
  assert.equal(withoutIntake.input.intake, null);
  check(await db.from("athlete_intakes").insert({ athlete_id: athlete.id, coach_id: user.id, status: "completed", current_step: 7, completed_at: new Date().toISOString(), answers: { days_per_week: 2, session_minutes: 45, location: "gym", equipment: ["Dumbbells", "Bike", "Box"], sleep_hours: 7, stress_level: "moderate", job_activity: "sedentary", eating_habits: "Three regular meals" } }));
  const withIntake = await SUGGESTION_REGISTRY.adjust_macros.buildRequest(db, { athleteId: athlete.id });
  assert.equal(withIntake.input.intake.answers.eating_habits, "Three regular meals");
  assert.equal(withIntake.input.intake.answers.days_per_week, 2);
  console.log("PASS: existing macro builder supports no intake and includes nutrition/lifestyle/schedule answers when present");
  const { draftProgramEntry } = load("src/lib/ai/draft-program.ts");
  const { loadAthleteSchedule } = load("src/lib/athlete-schedule.ts");
  const { programDate } = load("src/lib/program-dates.ts");
  const { approveSuggestionWithClient } = load("src/lib/ai/decisions.ts");
  const request = await draftProgramEntry.buildRequest(db, { athleteId: athlete.id });
  let suggestion;
  if (process.argv.includes("--live-ai")) {
    const { runSuggestionWithClient } = load("src/lib/ai/service-core.ts");
    const { schema: generationSchema, ...context } = request;
    const result = await runSuggestionWithClient(db, { type: "draft_program", athleteId: athlete.id, ...context, schema: draftProgramEntry.proposalSchema, generationSchema, validate: draftProgramEntry.validate });
    if ("error" in result) throw new Error(result.error);
    suggestion = check(await db.from("ai_suggestions").select("*").eq("id", result.id).single());
    console.log("PASS: live AI generation saved pending suggestion");
    const p = suggestion.proposal;
    console.log(JSON.stringify({ name: p.name, rationale: p.rationale, start_date: p.start_date, week_count: p.weeks.length, week_1: p.weeks[0] }, null, 2));
  } else {
    const movement = request.input.library[0];
    const proposal = { name: "Local atomic draft", rationale: "Test calendar placement", start_date: request.input.default_start_date, weeks: [1, 2, 3, 4].map((week_number) => ({ week_number, workouts: [1, 4].map((day_number) => ({ day_number, title: "Training", workout_type: "strength", time_cap_minutes: 30, rounds: null, description: null, notes: null, movements: [{ movement_id: movement.id, sets: 3, reps: 5, load: 100, distance_m: null, calories: null, duration_seconds: null, notes: null }] })) })) };
    suggestion = check(await db.from("ai_suggestions").insert({ suggestion_type: "draft_program", athlete_id: athlete.id, input: request.input, proposal, status: "pending" }).select("*").single());
  }
  assert.equal(suggestion.status, "pending");
  assert.equal(check(await db.from("programs").select("id")).length, 0);
  const approved = await approveSuggestionWithClient(db, suggestion, { ...suggestion.proposal, name: "Coach edited personal program" });
  if ("error" in approved) throw new Error(approved.error);
  const saved = check(await db.from("ai_suggestions").select("*").eq("id", suggestion.id).single());
  assert.equal(saved.status, "edited"); assert.equal(saved.target_table, "programs");
  const start = saved.final.start_date;
  const schedule = await loadAthleteSchedule(db, athlete.id, { from: start, to: programDate(start, 4, 7) }, "id, source_workout_id, title, week_number, day_number");
  const expectedDates = saved.final.weeks.flatMap((w) => w.workouts.map((d) => programDate(start, w.week_number, d.day_number))).sort();
  assert.deepEqual(schedule.map((w) => w.date).sort(), expectedDates);
  assert.ok(schedule.every((w) => w.source === "personal" && w.programId === saved.target_id));
  console.log(`PASS: approval creates personal program + assignment; loadAthleteSchedule sees ${schedule.length} workouts on ${expectedDates.join(", ")}`);
} finally {
  for (const id of users) check(await admin.auth.admin.deleteUser(id));
  console.log("Local fixture cleanup complete.");
}
