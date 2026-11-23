import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function load(relative, overrides = {}) {
  const filename = path.resolve(root, relative);
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = (id) => id in overrides ? overrides[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`, overrides) : id.startsWith(".") ? load(path.resolve(path.dirname(filename), `${id}.ts`), overrides) : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { intakeSchemas: schemas, GOAL_OPTIONS, healthFlag, stripHealthScreening } = load("src/lib/athlete-intake.ts");
const valid = [
  { birth_date: "1995-01-01", height_ft: 5, height_in: 10, weight: 180, sex: "" },
  { experience_level: "beginner", years_training: 0, crossfit_detail: "", sports_background: "", benchmarks: [] },
  { goals: [{ category: "Strength", target: "", target_value: "", target_date: "" }] },
  { injury_list: [], no_injuries: true },
  { days_per_week: 3, session_minutes: 60, location: "gym", equipment: ["Barbell"] },
  { diet_type: "none", allergies: "", dislikes: "", cooking_minutes: "", eating_habits: "" },
  { sleep_hours: 8, stress_level: "low", job_activity: "sedentary" },
  { health_screening: { heart_condition: false, chest_pain_activity: false, chest_pain_rest: false, dizziness_or_fainting: false, bone_joint_problem: false, blood_pressure_or_heart_meds: false, doctor_advised_no_exercise: false, pregnant: "no", recent_surgery: false, surgery_details: "", medications: "", conditions: "", emergency_contact: { name: "Jordan Smith", phone: "+1 (415) 555-0101", relationship: "Partner" } } },
];
test("coach intake summary renders goal titles then categories, never bookkeeping ids", async () => {
  const goalId = "35000000-0000-4000-8000-000000000001";
  const staleId = "35000000-0000-4000-8000-000000000002";
  const healthScreening = {
    ...valid[7].health_screening,
    emergency_contact: { name: "Alex Emergency Contact", phone: "555-010-2222", relationship: "Sibling" },
  };
  function text(node) {
    if (typeof node === "string" || typeof node === "number") return String(node);
    return [node?.props?.children].flat(Infinity).map((child) => child && typeof child === "object" ? text(child) : typeof child === "string" ? child : "").join("");
  }
  function elements(node, type) {
    if (!node || typeof node !== "object") return [];
    return [...(node.type === type ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap((child) => elements(child, type))];
  }
  for (const { categories, title, expected } of [
    { categories: { [goalId]: "Competition", [staleId]: "Strength" }, title: "Coach approved squat 205 lb", expected: "Coach approved squat 205 lb · Competition · 205" },
    { categories: undefined, title: "Coach approved squat 205 lb", expected: "Coach approved squat 205 lb · 205" },
    { categories: "invalid", title: "Coach approved squat 205 lb", expected: "Coach approved squat 205 lb · 205" },
    { categories: { [goalId]: "Strength" }, title: "Strength: Build dumbbell squat strength", expected: "Strength: Build dumbbell squat strength · 205" },
    { categories: { [goalId]: "Strength" }, title: "Strength", expected: "Strength · 205" },
  ]) {
    const db = { from(table) {
      const data = table === "athlete_intakes" ? { status: "completed", current_step: 8, requested_at: "2026-11-23", answers: { goal_ids: [goalId], goal_categories: categories, health_screening: healthScreening } }
        : table === "goals" ? [{ id: goalId, title, target_value: 205, target_date: null }]
        : ["body_metrics", "benchmark_results"].includes(table) ? [] : null;
      const q = { select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, single() { return q; }, maybeSingle() { return q; }, then(resolve) { return Promise.resolve({ data, error: null }).then(resolve); } };
      return q;
    } };
    const { IntakeTab } = load("src/app/(app)/athletes/[id]/intake-tab.tsx", {
      "next/cache": { revalidatePath() {} },
      "@/lib/supabase/server": { createClient: async () => db },
      "@/lib/coach": { getCoach: async () => ({ gymId: "coach" }) },
      "@/components/ui/button": { Button: "button" },
      "@/components/ui/badge": { Badge: "span" },
      "@/components/ui/card": { Card: "section", CardContent: "div", CardHeader: "header", CardTitle: "h2" },
      "@/components/suggestions/request-forms": { RequestIntakeAiForm: "form" },
    });
    const tree = await IntakeTab({ athleteId: "athlete", units: "lb" });
    const rendered = text(tree);
    assert.ok(rendered.includes(expected));
    assert.ok(rendered.includes("Alex Emergency Contact (Sibling) · 555-010-2222"));
    assert.ok(elements(tree, "a").some((element) => element.props.href === "tel:5550102222" && element.props.children === "555-010-2222"));
    assert.ok(!rendered.includes(goalId));
    assert.ok(!rendered.includes(staleId));
    assert.ok(!rendered.includes("goal categories"));
  }
});
test("all eight steps accept normal answers and optional empty values", () => {
  schemas.forEach((schema, i) => assert.equal(schema.safeParse(i === 7 ? valid[i].health_screening : valid[i]).success, true, `step ${i + 1}`));
  const food = schemas[5].parse({ ...valid[5], allergies: "peanuts, peanuts, milk" });
  assert.deepEqual(food.allergies, ["peanuts", "milk"]);
  assert.equal(food.cooking_minutes, null);
});
test("all steps reject missing data", () => schemas.forEach((schema) => assert.equal(schema.safeParse({}).success, false)));
test("health screening validates required answers and flags only higher-risk responses", () => {
  const screening = valid[7].health_screening;
  assert.equal(schemas[7].safeParse(screening).success, true);
  assert.equal(healthFlag(screening), false);
  assert.equal(healthFlag({ ...screening, heart_condition: true }), true);
  assert.equal(healthFlag({ ...screening, pregnant: "yes" }), true);
  assert.equal(healthFlag({ ...screening, recent_surgery: true }), true);
  assert.equal(healthFlag(null), false);
  const unanswered = schemas[7].safeParse({ ...screening, heart_condition: undefined });
  assert.equal(unanswered.success, false);
  assert.equal(unanswered.error.issues.find((issue) => issue.path[0] === "heart_condition").message, "Choose Yes or No.");
  const unansweredPregnancy = schemas[7].safeParse({ ...screening, pregnant: undefined });
  assert.equal(unansweredPregnancy.success, false);
  assert.equal(unansweredPregnancy.error.issues.find((issue) => issue.path[0] === "pregnant").message, "Choose an answer.");
  assert.equal(schemas[7].safeParse({ ...screening, recent_surgery: true }).success, false);
  assert.equal(schemas[7].safeParse({ ...screening, emergency_contact: { ...screening.emergency_contact, phone: "not a phone" } }).success, false);
  assert.equal(schemas[7].safeParse({ ...screening, medications: "x".repeat(1001) }).success, false);
});
test("AI intake data excludes health screening keys and preserves non-object inputs", () => {
  assert.deepEqual(stripHealthScreening({
    days_per_week: 3,
    health_screening: valid[7].health_screening,
    health_flag: true,
  }), { days_per_week: 3 });
  for (const value of [null, undefined, false, 7, "answers", ["answers"]]) {
    assert.equal(stripHealthScreening(value), value);
  }
});
test("injury prefill preserves profile notes and clearing requires explicit confirmation", () => {
  const { injuryPrefill } = load("src/lib/athlete-intake.ts");
  for (const answers of [{}, { injury_list: [] }]) {
    const prefill = injuryPrefill(answers, "Prior knee surgery");
    assert.equal(prefill.injury_list[0].notes, "Prior knee surgery");
    assert.equal(schemas[3].safeParse(prefill).success, true);
  }
  assert.deepEqual(injuryPrefill({ no_injuries: true }, "Prior knee surgery"), { injury_list: [], no_injuries: true });
  assert.deepEqual(injuryPrefill({}, null).injury_list, []);
  assert.equal(schemas[3].safeParse({ injury_list: [] }).success, false);
  assert.equal(schemas[3].safeParse({ injury_list: [], no_injuries: true }).success, true);
  assert.equal(schemas[3].safeParse({ injury_list: [{ area: "Knee", severity: "mild", notes: "Pain" }], no_injuries: true }).success, false);
});
test("invalid height, score, goals, injuries, schedule, nutrition and lifestyle fail", () => {
  const invalid = [
    { ...valid[0], height_ft: 3, height_in: 0 },
    { ...valid[1], benchmarks: [{ benchmark_id: "bad", load: -1 }] },
    { goals: [] },
    { injury_list: [{ area: "Knee", severity: "critical", notes: "" }] },
    { ...valid[4], days_per_week: 8 },
    { ...valid[5], cooking_minutes: "120" },
    { ...valid[6], sleep_hours: 25 },
  ];
  schemas.forEach((schema, i) => assert.equal(schema.safeParse(invalid[i]).success, false));
  assert.equal(schemas[1].safeParse({ ...valid[1], years_training: "" }).success, false);
  assert.equal(schemas[6].safeParse({ ...valid[6], sleep_hours: "" }).success, false);
  assert.equal(schemas[4].safeParse({ ...valid[4], equipment: ["None", "Barbell"] }).success, false);
});
test("goal choices accept six goals and repeated categories but reject seven and exact duplicates", () => {
  const makeGoal = (category, target) => ({ category, target, target_value: "", target_date: "" });
  const six = [
    makeGoal("Strength", "Raise back squat 1RM"),
    makeGoal("Strength", "Raise deadlift 1RM"),
    makeGoal("Conditioning", "Faster 5k run"),
    makeGoal("Body composition", "Build muscle"),
    makeGoal("Specific skill", "First strict pull-up"),
    makeGoal("Competition", "Do my first local competition"),
  ];
  assert.equal(schemas[2].safeParse({ goals: six }).success, true);
  assert.equal(schemas[2].safeParse({ goals: [...six, makeGoal("Strength", "Get stronger overall")] }).success, false);
  assert.equal(schemas[2].safeParse({ goals: six.slice(0, 2) }).success, true);
  const duplicate = schemas[2].safeParse({ goals: [makeGoal("Strength", "Raise back squat 1RM"), makeGoal("Strength", "RAISE BACK SQUAT 1RM")] });
  assert.equal(duplicate.success, false);
  assert.equal(duplicate.error.issues[0].message, "You've added that goal twice.");
  assert.deepEqual(GOAL_OPTIONS, {
    Strength: ["Raise back squat 1RM", "Raise front squat 1RM", "Raise deadlift 1RM", "Raise strict press 1RM", "Raise bench press 1RM", "Raise clean & jerk 1RM", "Raise snatch 1RM", "Get stronger overall"],
    Conditioning: ["Faster 5k run", "Faster 2k row", "Faster benchmark WOD time (e.g. Fran, Helen)", "Better engine for long WODs (20+ min)", "Recover faster between rounds"],
    "Body composition": ["Lose body fat", "Build muscle", "Reach a target body weight", "Keep my weight while getting stronger"],
    "Specific skill": ["First strict pull-up", "First kipping or butterfly pull-up", "First chest-to-bar pull-up", "First toes-to-bar", "First double-unders", "First handstand push-up", "First handstand walk", "First bar muscle-up", "First ring muscle-up", "First pistol squat", "First rope climb"],
    Competition: ["Do my first local competition", "Move up to the Rx division", "Improve my CrossFit Open ranking", "Qualify for the next stage after the Open", "Peak for a specific event date"],
  });
});

function actionHarness({ kind = "athlete", dbError = null, notificationError = null, notificationThrows = false } = {}) {
  const writes = [];
  const dispatches = [];
  const notifications = load("src/lib/notifications.ts", {
    "next/server": { after() {} },
    "@/lib/athlete-schedule": { loadAthleteSchedule: async () => [] },
    "@/lib/consistency-data": { loadDriftingAthletes: async () => [] },
    "@/lib/program-dates": { programDate: () => "" },
    "@/lib/time-zone": { getToday: async () => "2026-11-21" },
  });
  notifications.dispatchNewNotifications = (athleteId, notificationKind) => dispatches.push({ athleteId, kind: notificationKind });
  const { saveIntakeStep } = load("src/app/athlete/onboarding/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    "@/lib/viewer": { getViewer: async () => ({ kind, athleteId: "own-athlete", units: "lb" }) },
    "@/lib/time-zone": { getToday: async () => "2026-11-21" },
    "@/lib/notifications": notifications,
    "@/lib/supabase/server": { createClient: async () => ({
      rpc: async (name, args) => { writes.push({ name, ...args }); if (name === "create_notification" && notificationThrows) throw new Error("Notification offline"); return { error: name === "create_notification" ? notificationError : dbError }; },
      from: (table) => table === "athletes" ? { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { first_name: "Alex", last_name: "Athlete" }, error: null }) } : ({ select: async () => ({ data: [], error: null }) }),
    }) },
  });
  return { saveIntakeStep, writes, dispatches };
}
test("server action uses canonical fields, coach units and local today", async () => {
  const { saveIntakeStep, writes } = actionHarness();
  await assert.rejects(saveIntakeStep(1, valid[0]), /REDIRECT:\/athlete\/onboarding\?step=2/);
  assert.equal(writes[0].p_today, "2026-11-21");
  assert.equal(writes[0].p_athlete_id, "own-athlete");
  assert.deepEqual(writes[0].p_data, { birth_date: "1995-01-01", sex: "", height_cm: 177.8, weight_kg: 81.65 });
  await assert.rejects(saveIntakeStep(3, valid[2]), /REDIRECT/);
  assert.equal(writes[1].p_data.goals[0].goal_type, "performance");
  await assert.rejects(saveIntakeStep(7, valid[6]), /REDIRECT:\/athlete\/onboarding\?step=8/);
  await assert.rejects(saveIntakeStep(8, valid[7]), /REDIRECT:\/athlete$/);
  assert.deepEqual(writes[3].p_data, { health_screening: valid[7].health_screening });
});
test("completed intake notifies the coach only after saving, links intake, and tolerates notification failures", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const options of [{}, { notificationError: new Error("Denied") }, { notificationThrows: true }]) {
    const { saveIntakeStep, writes } = actionHarness(options);
    await assert.rejects(saveIntakeStep(8, valid[7]), /REDIRECT:\/athlete$/);
    assert.deepEqual(writes.map((write) => write.name), ["save_athlete_intake_step", "create_notification"]);
    assert.equal(writes[1].p_athlete_id, "own-athlete");
    assert.equal(writes[1].p_kind, "message");
    assert.match(writes[1].p_title, /Alex Athlete: Intake completed/);
    assert.equal(writes[1].p_link, "/athletes/own-athlete?tab=intake");
  }
  const failed = actionHarness({ dbError: new Error("Save failed") });
  assert.ok((await failed.saveIntakeStep(8, valid[7])).error);
  assert.deepEqual(failed.writes.map((write) => write.name), ["save_athlete_intake_step"]);
  assert.deepEqual(failed.dispatches, []);
  const partial = actionHarness();
  await assert.rejects(partial.saveIntakeStep(1, valid[0]), /REDIRECT/);
  assert.deepEqual(partial.writes.map((write) => write.name), ["save_athlete_intake_step"]);
});
test("successful flagged health screenings dispatch notifications after the intake RPC", async () => {
  const screening = { ...valid[7].health_screening, heart_condition: true };
  const flagged = actionHarness();
  await assert.rejects(flagged.saveIntakeStep(8, { health_screening: screening }), /REDIRECT:\/athlete$/);
  assert.equal(flagged.dispatches[0].athleteId, "own-athlete");
  assert.equal(flagged.dispatches[0].kind, "health_flag");
  assert.equal(flagged.writes[0].name, "save_athlete_intake_step");

  const unflagged = actionHarness();
  await assert.rejects(unflagged.saveIntakeStep(8, valid[7]), /REDIRECT:\/athlete$/);
  assert.equal(unflagged.dispatches.some((dispatch) => dispatch.kind === "health_flag"), false);
});
test("achieved goals render without edit controls, occupy picks and submit identity only", async () => {
  const goalIds = Array.from({ length: 6 }, (_, index) => `35000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const goals = goalIds.map((id) => ({ id, status: "achieved", category: "Strength", target: "Squat", target_value: 100, target_date: "2026-01-01" }));
  let submission;
  let pending;
  const { IntakeForm } = load("src/app/athlete/onboarding/intake-form.tsx", {
    react: { useState: (initial) => [initial, () => {}], useTransition: () => [false, (fn) => { pending = fn(); }] },
    "next/link": "a",
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "./actions": { saveIntakeStep: async (step, input) => { submission = { step, input }; } },
  });
  function elements(node, type) {
    if (!node || typeof node !== "object") return [];
    return [...(node.type === type ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap((child) => elements(child, type))];
  }
  const tree = IntakeForm({ step: 3, values: { goals }, benchmarks: [], units: "kg" });
  assert.match(JSON.stringify(tree), /Achieved/);
  assert.equal(elements(tree, "input").length, 0);
  assert.equal(elements(tree, "select").length, 0);
  assert.equal(elements(tree, "button").some((button) => button.props.children === "Remove"), false);
  assert.equal(elements(tree, "button").find((button) => button.props.children === "Add goal").props.disabled, true);
  elements(tree, "form")[0].props.onSubmit({ preventDefault() {} });
  await pending;
  assert.deepEqual(submission.input.goals, goals.map(({ id, status }) => ({ id, status })));
  assert.equal(schemas[2].safeParse(submission.input).success, true);
  assert.equal(schemas[2].safeParse({ goals: [...goals, valid[2].goals[0]] }).success, false);
  const { saveIntakeStep, writes } = actionHarness();
  await assert.rejects(saveIntakeStep(3, submission.input), /REDIRECT/);
  assert.deepEqual(writes[0].p_data.goals, goals.map(({ id }) => ({ id })));
});
test("goal editor offers category-specific options and keeps unknown saved targets custom", () => {
  let formState = {
    goals: [
      { category: "Strength", target: "Raise back squat 1RM", target_value: "", target_date: "" },
      { category: "Strength", target: "Work toward a strict ring dip", target_value: "", target_date: "" },
    ],
  };
  let stateCalls = 0;
  const { IntakeForm } = load("src/app/athlete/onboarding/intake-form.tsx", {
    react: {
      useState(initial) {
        stateCalls += 1;
        if (stateCalls === 1) return [formState, (next) => { formState = typeof next === "function" ? next(formState) : next; }];
        return [initial, () => {}];
      },
      useTransition: () => [false, () => {}],
    },
    "next/link": "a",
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "./actions": { saveIntakeStep: async () => ({}) },
  });
  function elements(node, type) {
    if (!node || typeof node !== "object") return [];
    return [...(node.type === type ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap((child) => elements(child, type))];
  }
  const tree = IntakeForm({ step: 3, values: formState, benchmarks: [], units: "kg" });
  const selects = elements(tree, "select");
  assert.equal(selects.length, 4);
  assert.equal(selects[0].props.value, "Strength");
  assert.equal(selects[1].props.value, "Raise back squat 1RM");
  assert.equal(selects[2].props.value, "Strength");
  assert.equal(selects[3].props.value, "__custom_goal__");
  assert.match(JSON.stringify(selects[1]), /Something else \(write your own\)/);
  assert.equal(elements(tree, "input").some((input) => input.props.value === "Work toward a strict ring dip"), true);
  selects[0].props.onChange({ target: { value: "Conditioning" } });
  assert.deepEqual(formState.goals[0], { category: "Conditioning", target: "", target_value: "", target_date: "", specific_goal_choice: "" });
});
test("new health screening selects start unanswered while saved answers stay prefilled", () => {
  function render(values) {
    let formState = values;
    let stateCalls = 0;
    const { IntakeForm } = load("src/app/athlete/onboarding/intake-form.tsx", {
      react: {
        useState(initial) {
          stateCalls += 1;
          return stateCalls === 1 ? [formState, (next) => { formState = typeof next === "function" ? next(formState) : next; }] : [initial, () => {}];
        },
        useTransition: () => [false, () => {}],
      },
      "next/link": "a",
      "@/components/ui/button": { Button: "button" },
      "@/components/ui/input": { Input: "input" },
      "@/components/ui/textarea": { Textarea: "textarea" },
      "./actions": { saveIntakeStep: async () => ({}) },
    });
    return { tree: IntakeForm({ step: 8, values, benchmarks: [], units: "kg" }), get formState() { return formState; } };
  }
  function elements(node, type) {
    if (!node || typeof node !== "object") return [];
    return [...(node.type === type ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap((child) => elements(child, type))];
  }

  const blank = render({ health_screening: { surgery_details: "", medications: "", conditions: "", emergency_contact: { name: "", phone: "", relationship: "" } } });
  const blankSelects = elements(blank.tree, "select");
  assert.equal(blankSelects.length, 9);
  for (const select of blankSelects) {
    assert.equal(select.props.required, true);
    assert.equal(select.props.value, "");
    assert.ok(elements(select, "option").some((option) => option.props.value === "" && option.props.children === "Choose…"));
  }
  blankSelects[0].props.onChange({ target: { value: "" } });
  assert.equal(blank.formState.health_screening.heart_condition, undefined);
  blankSelects[7].props.onChange({ target: { value: "" } });
  assert.equal(blank.formState.health_screening.pregnant, undefined);

  const saved = render({ health_screening: valid[7].health_screening });
  const savedSelects = elements(saved.tree, "select");
  assert.equal(savedSelects[0].props.value, "no");
  assert.equal(savedSelects[7].props.value, "no");
  assert.equal(savedSelects[8].props.value, "no");
});
test("canonical coach goal edits survive resend and unchanged saves submit no field edits", async () => {
  const { goalPrefill } = load("src/lib/athlete-intake.ts");
  const goal = { id: "35000000-0000-4000-8000-000000000001", status: "active", title: "Coach approved squat 205 lb", goal_type: "performance", target_value: 205, target_date: "2027-01-01" };
  const prefill = goalPrefill(goal);
  assert.equal(prefill.target, goal.title);
  assert.equal(prefill.target_value, 205);
  assert.equal(prefill.target_date, goal.target_date);
  const { saveIntakeStep, writes } = actionHarness();
  await assert.rejects(saveIntakeStep(3, { goals: [prefill] }), /REDIRECT/);
  assert.deepEqual(writes[0].p_data.goals, [{ id: goal.id }]);
  await assert.rejects(saveIntakeStep(3, { goals: [{ ...prefill, target_value: 210 }] }), /REDIRECT/);
  assert.deepEqual(writes[1].p_data.goals, [{ id: goal.id, target_value: 210 }]);
  await assert.rejects(saveIntakeStep(3, { goals: [{ ...prefill, target: "Athlete updated squat" }] }), /REDIRECT/);
  assert.deepEqual(writes[2].p_data.goals, [{ id: goal.id, title: "Strength: Athlete updated squat" }]);
  const retyped = goalPrefill({ ...goal, title: "Strength: coach changed the type", goal_type: "skill" });
  await assert.rejects(saveIntakeStep(3, { goals: [retyped] }), /REDIRECT/);
  assert.deepEqual(writes[3].p_data.goals, [{ id: goal.id }]);
});
test("performance priorities round-trip independently of coach-edited titles", () => {
  const { goalPrefill, goalPayload, goalInputSchema } = load("src/lib/athlete-intake.ts");
  const goal = { id: "35000000-0000-4000-8000-000000000001", status: "active", title: "Coach approved squat 205 lb", goal_type: "performance", target_value: 205, target_date: null };
  let previous = "Strength";
  for (const category of ["Conditioning", "Competition", "Strength"]) {
    const form = goalPrefill(goal, previous);
    assert.equal(form.category, previous);
    const payload = goalPayload(goalInputSchema.parse({ ...form, category }));
    assert.deepEqual(payload, { id: goal.id, category });
    assert.equal(goalPrefill(goal, category).category, category);
    previous = category;
  }
});
test("reopening a maximum-length target removes only questionnaire prefixes and preserves canonical titles", () => {
  const { goalPrefill, goalPayload, goalInputSchema, GOAL_CATEGORIES } = load("src/lib/athlete-intake.ts");
  for (const category of GOAL_CATEGORIES) {
    const goal_type = category === "Body composition" ? "body_composition" : category === "Specific skill" ? "skill" : "performance";
    for (const target of ["", "x".repeat(200)]) {
      const goal = { id: "35000000-0000-4000-8000-000000000001", status: "active", title: `${category}${target ? `: ${target}` : ""}`, goal_type, target_value: null, target_date: null };
      const form = goalPrefill(goal, category);
      assert.equal(form.target, target);
      assert.deepEqual(goalPayload(goalInputSchema.parse(form)), { id: goal.id });
    }
  }
  const goal = { id: "35000000-0000-4000-8000-000000000001", status: "active", title: "Coach note: squat 205 lb", goal_type: "performance", target_value: 205, target_date: null };
  assert.equal(goalPrefill(goal).target, goal.title);
});
test("server action rejects invalid, empty, unauthorized, future and unknown benchmark input; reports database errors", async () => {
  const { saveIntakeStep, writes } = actionHarness();
  for (const [step, data] of [[0, {}], [1, {}], [1, { ...valid[0], birth_date: "2026-11-22" }], [2, { ...valid[1], benchmarks: [{ benchmark_id: "35000000-0000-0000-0000-000000000099", load: 100, time_seconds: "", rounds: "", reps: "" }] }]]) {
    assert.ok((await saveIntakeStep(step, data)).error);
  }
  assert.equal(writes.length, 0);
  assert.ok((await actionHarness({ kind: "coach" }).saveIntakeStep(1, valid[0])).error);
  assert.match((await actionHarness({ dbError: new Error("database unavailable") }).saveIntakeStep(1, valid[0])).error, /Couldn't save/);
});

test("gate redirects requested/in-progress intakes only, permits onboarding and preserves completed/no-row access", async () => {
  for (const [pathName, status, expected] of [["/athlete", "requested", "redirect"], ["/athlete/history", "in_progress", "redirect"], ["/athlete/onboarding", "requested", "next"], ["/athlete", "completed", "next"], ["/athlete", null, "next"]]) {
    const cookies = { getAll: () => [], set() {} };
    const queries = [];
    const { updateSession } = load("src/lib/supabase/middleware.ts", {
      "@supabase/ssr": { createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "own-user" } } }) }, from: (table) => { queries.push(table); return { select(columns) { assert.equal(columns, "status, athletes!inner(user_id)"); return this; }, eq(column, value) { assert.equal(column, "athletes.user_id"); assert.equal(value, "own-user"); return this; }, maybeSingle: async () => ({ data: status ? { status } : null, error: null }) }; } }) },
      "next/server": { NextResponse: { next: () => ({ kind: "next", cookies }), redirect: (url) => ({ kind: "redirect", url, cookies }) } },
    });
    const url = new URL(`http://localhost${pathName}?other=1`);
    url.clone = () => new URL(url);
    const response = await updateSession({ nextUrl: url, cookies });
    assert.equal(response.kind, expected, `${pathName}: ${status}`);
    assert.deepEqual(queries, pathName === "/athlete/onboarding" ? [] : ["athlete_intakes"]);
    if (expected === "redirect") { assert.equal(response.url.pathname, "/athlete/onboarding"); assert.equal(response.url.search, ""); }
  }
});

test("unauthenticated deep links preserve their query through login and safeNextPath", async () => {
  const cookies = { getAll: () => [], set() {} };
  const { updateSession } = load("src/lib/supabase/middleware.ts", {
    "@supabase/ssr": { createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: null } }) } }) },
    "next/server": { NextResponse: { next: () => ({ cookies }), redirect: (url) => ({ kind: "redirect", url, cookies }) } },
  });
  const { safeNextPath } = load("src/lib/auth/redirect.ts", {
    "next/headers": { headers: async () => new Headers() },
  });
  async function redirectedUrl(path) {
    const url = new URL(`http://localhost${path}`);
    url.clone = () => new URL(url);
    const response = await updateSession({ nextUrl: url, cookies });
    assert.equal(response.kind, "redirect");
    return response.url;
  }

  const deepLink = "/athletes/123?tab=progress&range=90";
  const loginUrl = await redirectedUrl(deepLink);
  assert.equal(loginUrl.pathname, "/login");
  const next = loginUrl.searchParams.get("next");
  assert.equal(next, deepLink);
  assert.equal(safeNextPath(next), deepLink);
  assert.equal((await redirectedUrl("/")).search, "");
});

test("gate logs lookup errors and rejected queries but allows athlete pages through", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  for (const rejects of [false, true]) {
    const error = new Error("Intake lookup unavailable");
    const cookies = { getAll: () => [], set() {} };
    const { updateSession } = load("src/lib/supabase/middleware.ts", {
      "@supabase/ssr": { createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "own-user" } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => { if (rejects) throw error; return { data: null, error }; } }) }) },
      "next/server": { NextResponse: { next: () => ({ kind: "next", cookies }), redirect: () => { throw new Error("Unexpected redirect"); } } },
    });
    const url = new URL("http://localhost/athlete/history");
    assert.equal((await updateSession({ nextUrl: url, cookies })).kind, "next");
    assert.deepEqual(log.mock.calls.at(-1).arguments, ["Unable to check athlete intake:", error]);
  }
  assert.equal(log.mock.callCount(), 2);
});
