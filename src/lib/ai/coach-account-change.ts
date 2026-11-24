import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { toKg, type Units } from "@/lib/units";
import { ApprovalError } from "./errors";
import {
  coachAccountChangeProposalSchema,
  type CoachAccountChange,
} from "./account-change";

type Client = SupabaseClient<Database>;
type Proposal = { change: CoachAccountChange; before: Record<string, unknown> };

async function athleteInScope(client: Client, athleteId: string, gymId: string) {
  const { data, error } = await client.from("athletes")
    .select("id, coach_id, first_name, last_name, assigned_coach_id, experience_level, injuries, notes")
    .eq("id", athleteId).eq("coach_id", gymId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Choose an athlete from your roster.");
  return data;
}

export async function createCoachAccountChangeSuggestion(
  client: Client,
  gymId: string,
  athleteId: string,
  units: Units,
  input: unknown,
) {
  const parsed = coachAccountChangeProposalSchema.shape.change.safeParse(input);
  if (!parsed.success) throw new Error("Check the requested account change.");
  const change = parsed.data;
  const athlete = await athleteInScope(client, athleteId, gymId);
  let before: Record<string, unknown> = {};

  if (change.kind === "profile") {
    before = Object.fromEntries([
      ["experience_level", change.experience_level === undefined ? undefined : athlete.experience_level],
      ["injuries", change.injuries === undefined ? undefined : athlete.injuries],
      ["notes", change.notes === undefined ? undefined : athlete.notes],
    ].filter(([, value]) => value !== undefined));
  } else if (change.kind === "assigned_coach") {
    const [current, target] = await Promise.all([
      athlete.assigned_coach_id
        ? client.from("coaches").select("full_name").eq("id", athlete.assigned_coach_id).eq("gym_id", gymId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      change.coach_id
        ? client.from("coaches").select("id, full_name").eq("id", change.coach_id).eq("gym_id", gymId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (current.error || target.error) throw current.error ?? target.error;
    if (change.coach_id && !target.data) throw new Error("Choose a coach in your coaching team.");
    before = { coach_id: athlete.assigned_coach_id, coach_name: current.data?.full_name ?? null, target_coach_name: target.data?.full_name ?? null };
  } else if (change.kind === "program") {
    const [{ data: program, error: programError }, { data: assignments, error: assignmentError }] = await Promise.all([
      client.from("programs").select("id, name, athlete_id").eq("id", change.program_id).eq("coach_id", gymId).maybeSingle(),
      client.from("program_assignments").select("program_id, start_date, programs(name)").eq("athlete_id", athleteId).eq("coach_id", gymId),
    ]);
    if (programError || assignmentError) throw programError ?? assignmentError;
    if (!program || (program.athlete_id && program.athlete_id !== athleteId)) throw new Error("Choose a program from your account.");
    const assigned = (assignments ?? []).map((assignment) => ({
      id: assignment.program_id,
      name: assignment.programs?.name ?? "Program",
      start_date: assignment.start_date,
    }));
    if (change.action === "unassign" && !assigned.some((assignment) => assignment.id === change.program_id))
      throw new Error("That program is not assigned to this athlete.");
    before = {
      assigned,
      target_program_name: program.name,
    };
  } else if (change.kind === "body_weight") {
    const { data, error } = await client.from("body_metrics").select("weight_kg, measured_on")
      .eq("athlete_id", athleteId).not("weight_kg", "is", null).order("measured_on", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    before = { weight_kg: data?.weight_kg ?? null, measured_on: data?.measured_on ?? null };
    if (toKg(change.value, units) >= 1000) throw new Error("Enter a body weight below 1,000 kg.");
  } else if (change.action === "create") {
    const { count, error } = await client.from("goals").select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId).eq("status", "active");
    if (error) throw error;
    before = { active_goal_count: count ?? 0 };
  } else {
    const { data, error } = await client.from("goals")
      .select("id, title, goal_type, target_value, unit, target_date, status")
      .eq("id", change.goal_id!).eq("athlete_id", athleteId).eq("coach_id", gymId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Choose one of this athlete's goals.");
    before = { goal: data };
  }

  const proposal: Proposal = { change, before };
  const { data, error } = await client.from("ai_suggestions").insert({
    coach_id: gymId,
    athlete_id: athleteId,
    suggestion_type: "athlete_account_change",
    status: "pending",
    input: { source: "coach_chat", units },
    proposal: proposal as unknown as Json,
  }).select("id").single();
  if (error || !data) throw error ?? new Error("Couldn't create the change proposal.");
  return { suggestion_id: data.id, status: "pending_coach_approval" as const };
}

async function currentScope(client: Client, expectedGymId: string) {
  const { data, error } = await client.rpc("current_gym_id");
  if (error || data !== expectedGymId) throw new ApprovalError("This suggestion is outside your coach scope.");
}

async function activeGoalCount(client: Client, athleteId: string) {
  const { count, error } = await client.from("goals").select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId).eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

export async function applyCoachAccountChange(
  client: Client,
  suggestion: Tables<"ai_suggestions">,
  final: unknown,
) {
  const parsed = coachAccountChangeProposalSchema.parse(final);
  const athleteId = suggestion.athlete_id;
  if (!athleteId) throw new ApprovalError("This change has no athlete.");
  await currentScope(client, suggestion.coach_id);
  await athleteInScope(client, athleteId, suggestion.coach_id);
  const { change } = parsed;
  if (change.kind === "profile") {
    const update = {
      ...(change.experience_level === undefined ? {} : { experience_level: change.experience_level }),
      ...(change.injuries === undefined ? {} : { injuries: change.injuries }),
      ...(change.notes === undefined ? {} : { notes: change.notes }),
    };
    const { error } = await client.from("athletes").update(update).eq("id", athleteId).eq("coach_id", suggestion.coach_id);
    if (error) throw error;
    return { target_table: "athletes", target_id: athleteId };
  }
  if (change.kind === "assigned_coach") {
    if (change.coach_id) {
      const { data, error } = await client.from("coaches").select("id").eq("id", change.coach_id).eq("gym_id", suggestion.coach_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new ApprovalError("That coach is no longer in your coaching team.");
    }
    const { error } = await client.from("athletes").update({ assigned_coach_id: change.coach_id })
      .eq("id", athleteId).eq("coach_id", suggestion.coach_id);
    if (error) throw error;
    return { target_table: "athletes", target_id: athleteId };
  }
  if (change.kind === "program") {
    const { data: program, error: programError } = await client.from("programs").select("id, athlete_id")
      .eq("id", change.program_id).eq("coach_id", suggestion.coach_id).maybeSingle();
    if (programError) throw programError;
    if (!program || (program.athlete_id && program.athlete_id !== athleteId))
      throw new ApprovalError("That program is no longer available for this athlete.");
    if (change.action === "unassign") {
      const { data: assignment, error } = await client.from("program_assignments").select("id")
        .eq("program_id", change.program_id).eq("athlete_id", athleteId).eq("coach_id", suggestion.coach_id).maybeSingle();
      if (error) throw error;
      if (!assignment) throw new ApprovalError("That program is no longer assigned to this athlete.");
      const { error: deleteError } = await client.from("program_assignments").delete().eq("id", assignment.id);
      if (deleteError) throw deleteError;
      return { target_table: "program_assignments", target_id: assignment.id };
    }
    const { data, error } = await client.from("program_assignments").upsert({
      coach_id: suggestion.coach_id, program_id: change.program_id, athlete_id: athleteId, start_date: change.start_date!,
    }, { onConflict: "program_id,athlete_id" }).select("id").single();
    if (error || !data) throw error ?? new Error("Couldn't assign this program.");
    return { target_table: "program_assignments", target_id: data.id };
  }
  if (change.kind === "body_weight") {
    const input = suggestion.input && typeof suggestion.input === "object" && !Array.isArray(suggestion.input)
      ? suggestion.input : null;
    const units = input?.units;
    if (units !== "kg" && units !== "lb") throw new ApprovalError("The weight units for this change are unavailable.");
    const weightKg = toKg(change.value, units);
    if (weightKg <= 0 || weightKg >= 1000) throw new ApprovalError("Enter a body weight below 1,000 kg.");
    const { data: metric, error: insertError } = await client.from("body_metrics").insert({
      coach_id: suggestion.coach_id, athlete_id: athleteId, measured_on: change.measured_on, weight_kg: weightKg,
    }).select("id").single();
    if (insertError || !metric) throw insertError ?? new Error("Couldn't save this body weight.");
    return { target_table: "body_metrics", target_id: metric.id };
  }
  if (change.action === "create") {
    if (await activeGoalCount(client, athleteId) >= 6) throw new ApprovalError("This athlete already has six active goals.");
    const { data, error } = await client.from("goals").insert({
      coach_id: suggestion.coach_id, athlete_id: athleteId, title: change.title!, goal_type: change.goal_type!,
      target_value: change.target_value ?? null, unit: change.unit ?? null, target_date: change.target_date ?? null,
    }).select("id").single();
    if (error || !data) throw error ?? new Error("Couldn't create this goal.");
    return { target_table: "goals", target_id: data.id };
  }
  const { data: goal, error: goalError } = await client.from("goals").select("id, status")
    .eq("id", change.goal_id!).eq("athlete_id", athleteId).eq("coach_id", suggestion.coach_id).maybeSingle();
  if (goalError) throw goalError;
  if (!goal) throw new ApprovalError("That goal no longer belongs to this athlete.");
  if (change.action === "update") {
    const update = {
      ...(change.title === undefined ? {} : { title: change.title }),
      ...(change.target_value === undefined ? {} : { target_value: change.target_value }),
      ...(change.target_date === undefined ? {} : { target_date: change.target_date }),
    };
    const { error } = await client.from("goals").update(update).eq("id", goal.id).eq("athlete_id", athleteId);
    if (error) throw error;
  } else {
    if (change.status === "active" && goal.status !== "active" && await activeGoalCount(client, athleteId) >= 6)
      throw new ApprovalError("This athlete already has six active goals.");
    const { error } = await client.from("goals").update({
      status: change.status!,
      achieved_at: change.status === "achieved" ? new Date().toISOString() : null,
    }).eq("id", goal.id).eq("athlete_id", athleteId);
    if (error) throw error;
  }
  return { target_table: "goals", target_id: goal.id };
}
