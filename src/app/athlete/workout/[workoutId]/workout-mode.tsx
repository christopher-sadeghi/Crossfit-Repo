"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { MovementDemoSheet } from "@/components/movements/movement-demo-sheet";
import {
  BAR_OPTIONS,
  PLATE_SETS,
  defaultBar,
  platesPerSide,
} from "@/lib/plates";
import { parsePercentages, percentageLoad } from "@/lib/percent-loads";
import { fromKgPrecise, type Units } from "@/lib/units";
import {
  crossedCues,
  defaultTimer,
  elapsedTime,
  timerDuration,
  timerView,
  type TimerConfig,
} from "@/lib/workout-timer";
import type { WorkoutMovement } from "@/lib/workout-version";
import type { Enums } from "@/lib/supabase/database.types";

const positive = z.number().int().min(1).max(86400);
const ready = { readySeconds: z.number().int().min(0).max(60).optional() };
const configSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("for_time"),
    capSeconds: positive.optional(),
    ...ready,
  }),
  z.object({ mode: z.literal("amrap"), durationSeconds: positive, ...ready }),
  z.object({
    mode: z.literal("emom"),
    intervalSeconds: positive,
    intervals: positive.max(1000),
    ...ready,
  }),
  z.object({
    mode: z.literal("tabata"),
    work: positive,
    rest: positive,
    rounds: positive.max(1000),
    ...ready,
  }),
  z.object({ mode: z.literal("rest"), seconds: positive, ...ready }),
]);
const savedSchema = z.object({
  config: configSchema,
  clock: z.object({
    startedAt: z.number().nonnegative().nullable(),
    pausedAt: z.number().nonnegative().nullable(),
    accumulated: z.number().nonnegative(),
  }),
  rounds: z.number().int().min(0).max(100000),
  reps: z.number().int().min(0).max(100000),
  weights: z.record(z.string(), z.number().min(0).max(10000)),
  done: z.array(z.string()).max(10000),
  notes: z.string().max(500),
  rx: z.boolean(),
  completedAtCap: z.boolean().default(false),
});
type Session = z.infer<typeof savedSchema>;
type Workout = {
  id: string;
  title: string;
  description: string | null;
  workout_type: Enums<"workout_type">;
  time_cap_seconds: number | null;
  rounds: number | null;
  movements: WorkoutMovement[];
  isScaled: boolean;
  modifications: string;
};
const emptyClock = { startedAt: null, pausedAt: null, accumulated: 0 };
const timeLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function WorkoutMode({
  athleteId,
  date,
  units,
  workout,
  maxes,
}: {
  athleteId: string;
  date: string;
  units: Units;
  workout: Workout;
  maxes: { movement_id: string; oneRmKg: number | null }[];
}) {
  const router = useRouter();
  const storageKey = `workout:${athleteId}:${workout.id}:${date}`;
  const barKey = `workout-bar:${athleteId}:${units}`;
  const initial = (): Session => ({
    config: defaultTimer(workout),
    clock: emptyClock,
    rounds: 0,
    reps: 0,
    weights: {},
    done: [],
    notes: "",
    rx: !workout.isScaled,
    completedAtCap: false,
  });
  const [session, setSession] = useState<Session>(initial);
  const [loaded, setLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [bar, setBar] = useState(defaultBar(units));
  const [calculatorWeight, setCalculatorWeight] = useState("");
  const [now, setNow] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const previousElapsed = useRef(0);
  const leaving = useRef(false);
  const elapsed = elapsedTime(session.clock, now);
  const view = timerView(session.config, elapsed);
  const running =
    session.clock.startedAt !== null &&
    session.clock.pausedAt === null &&
    view.phase !== "done";
  const locked =
    session.clock.startedAt !== null || session.clock.accumulated > 0;
  const update = (changes: Partial<Session>) =>
    setSession((s) => ({ ...s, ...changes }));

  useEffect(() => {
    const timestamp = Date.now();
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = savedSchema.safeParse(JSON.parse(saved));
        if (parsed.success) {
          setSession(parsed.data);
          previousElapsed.current = elapsedTime(parsed.data.clock, timestamp);
        } else
          setStorageWarning(
            "Saved workout could not be restored. Start again or reset.",
          );
      }
      const savedBar = Number(localStorage.getItem(barKey));
      if (BAR_OPTIONS[units].includes(savedBar)) setBar(savedBar);
    } catch {
      setStorageWarning(
        "Workout storage is unavailable. Keep this page open to avoid losing progress.",
      );
    }
    setNow(timestamp);
    setLoaded(true);
  }, [storageKey, barKey, units]);

  useEffect(() => {
    if (!loaded || leaving.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
      setStorageWarning(
        "Could not save progress on this device. Keep this page open.",
      );
    }
  }, [session, loaded, storageKey]);

  function unlockAudio() {
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => {});
    } catch {
      /* Audio is best-effort. */
    }
  }

  useEffect(() => {
    if (!loaded || !running) return;
    const tick = () => {
      const timestamp = Date.now();
      const current = elapsedTime(session.clock, timestamp);
      const cues = crossedCues(
        session.config,
        previousElapsed.current,
        current,
      );
      previousElapsed.current = current;
      const cue = cues.at(-1);
      if (cue && document.visibilityState === "visible") {
        try {
          const context = audio.current;
          if (context?.state === "running") {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.frequency.value = cue.kind === "beep" ? 660 : 990;
            gain.gain.setValueAtTime(0.2, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(
              0.001,
              context.currentTime + 0.2,
            );
            oscillator.start();
            oscillator.stop(context.currentTime + 0.22);
          }
          if (typeof navigator.vibrate === "function")
            navigator.vibrate(cue.kind === "beep" ? 80 : [150, 80, 150]);
        } catch {
          /* Cues are best-effort. */
        }
      }
      setNow(timestamp);
    };
    const interval = window.setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [loaded, running, session.clock, session.config]);

  useEffect(() => {
    if (!running || !loaded || !("wakeLock" in navigator)) return;
    let active = true;
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released))
        return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (!active) await next.release();
        else lock = next;
      } catch {
        /* Wake lock is best-effort. */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      active = false;
      void lock?.release();
      document.removeEventListener("visibilitychange", acquire);
    };
  }, [loaded, running]);

  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );

  function start(fresh = false) {
    unlockAudio();
    const timestamp = Date.now();
    const accumulated = fresh ? 0 : elapsedTime(session.clock, timestamp);
    previousElapsed.current = fresh ? -1 : accumulated;
    setNow(timestamp);
    update({ clock: { startedAt: timestamp, pausedAt: null, accumulated } });
  }

  function movementLoad(movement: WorkoutMovement, set: number) {
    const percentages = parsePercentages(movement.notes, movement.sets ?? 1);
    const percent = (
      percentages.length
        ? percentages
        : parsePercentages(workout.description, movement.sets ?? 1)
    )[set];
    const max = maxes.find(
      (m) => m.movement_id === movement.movement_id,
    )?.oneRmKg;
    if (movement.load_kg != null)
      return {
        weight: fromKgPrecise(movement.load_kg, units),
        label: "Prescribed",
      };
    if (percent && max)
      return {
        weight: percentageLoad(max, percent, units, bar).weight,
        label: `${Math.round(percent * 10) / 10}% of 1RM`,
      };
    return {
      weight: undefined,
      label: percent
        ? `${percent}% · no 1RM — enter working weight`
        : "Enter working weight",
    };
  }

  function finish() {
    const total = elapsedTime(session.clock, Date.now());
    const workSeconds = Math.min(
      timerDuration(session.config),
      Math.max(
        0,
        Math.floor(total / 1000 - (session.config.readySeconds ?? 10)),
      ),
    );
    const params = new URLSearchParams({
      date,
      is_rx: session.rx ? "rx" : "scaled",
    });
    const type = workout.workout_type;
    if (type === "for_time") {
      const cap =
        session.config.mode === "for_time"
          ? session.config.capSeconds
          : workout.time_cap_seconds;
      if (cap && workSeconds >= cap && !session.completedAtCap) {
        params.set("time_seconds", String(cap));
        params.set("reps", String(session.reps));
      } else
        params.set(
          "time_seconds",
          String(cap ? Math.min(cap, workSeconds) : workSeconds),
        );
    } else if (type === "amrap" || type === "emom" || type === "other") {
      params.set("rounds", String(session.rounds));
      params.set("reps", String(session.reps));
      if (type === "other") params.set("time_seconds", String(workSeconds));
    }
    const sets = workout.movements.flatMap((movement, i) =>
      Array.from({ length: Math.min(100, movement.sets ?? 1) }, (_, j) => {
        const key = `${i}-${j}`;
        const weight = session.weights[key] ?? movementLoad(movement, j).weight;
        return session.done.includes(key) && weight !== undefined
          ? { name: movement.name, reps: movement.reps, weight }
          : null;
      }).filter((s) => s !== null),
    );
    if ((type === "strength" || type === "other") && sets.length)
      params.set("load", String(Math.max(...sets.map((s) => s.weight))));
    if (type === "other" && !sets.length) {
      const weights = workout.movements
        .map(
          (movement, i) =>
            session.weights[`${i}-0`] ?? movementLoad(movement, 0).weight,
        )
        .filter((weight): weight is number => weight !== undefined);
      if (weights.length) params.set("load", String(Math.max(...weights)));
    }
    const summary =
      type === "strength" && sets.length
        ? `Sets: ${sets.map((s) => `${s.name} ${s.reps ?? "?"}×${s.weight}${units}`).join(", ")}`
        : "";
    params.set(
      "notes",
      [session.notes, summary].filter(Boolean).join("\n").slice(0, 500),
    );
    leaving.current = true;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Storage may be unavailable. */
    }
    update({ clock: { ...session.clock, pausedAt: Date.now() } });
    router.push(`/athlete/log/${workout.id}?${params}`);
  }

  const currentMovement = workout.movements.length
    ? workout.movements[view.index % workout.movements.length]
    : null;
  const activeCap =
    session.config.mode === "for_time"
      ? session.config.capSeconds
      : workout.time_cap_seconds;
  const calculator =
    calculatorWeight !== "" &&
    Number.isFinite(Number(calculatorWeight)) &&
    Number(calculatorWeight) >= 0 &&
    Number(calculatorWeight) <= 10000
      ? platesPerSide(Number(calculatorWeight), bar, PLATE_SETS[units])
      : null;
  if (!loaded)
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-slate-950 text-white"
        role="status"
      >
        Restoring workout…
      </div>
    );
  return (
    <main className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 text-white [&_button]:min-h-12 [&_button]:min-w-12 [&_button]:rounded-xl [&_button]:border [&_button]:border-slate-600 [&_button]:px-4 [&_input:not([type=checkbox])]:min-h-12 [&_input:not([type=checkbox])]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-slate-500 [&_input]:bg-slate-900 [&_input]:p-3 [&_select]:min-h-12 [&_select]:rounded-lg [&_select]:bg-slate-800 [&_select]:p-3">
      <div className="mx-auto grid max-w-xl gap-6 p-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-300">Workout mode · {date}</p>
            <h1 className="text-2xl font-bold">{workout.title}</h1>
          </div>
          <Link
            href="/athlete"
            aria-label="Exit workout"
            className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-500 text-2xl"
          >
            ×
          </Link>
        </header>
        {storageWarning && (
          <p role="alert" className="text-amber-300">
            {storageWarning}
          </p>
        )}
        {workout.modifications && (
          <p className="rounded-xl bg-slate-800 p-4">{workout.modifications}</p>
        )}
        <section className="grid gap-3 text-center" aria-label="Workout timer">
          <p className="text-lg uppercase tracking-widest text-cyan-300">
            {view.phase === "countdown"
              ? "Get ready"
              : view.phase === "done"
                ? "Time!"
                : `${session.config.mode.replace("_", " ")} · ${view.phase}`}
          </p>
          <output
            className="font-mono text-[clamp(4.5rem,21vw,7rem)] leading-none font-bold tabular-nums"
            aria-label="Timer"
          >
            {timeLabel(view.displaySeconds)}
          </output>
          {(session.config.mode === "emom" ||
            session.config.mode === "tabata") && (
            <p className="text-xl">
              {session.config.mode === "emom" ? "Interval" : "Round"}{" "}
              {view.index + 1} /{" "}
              {session.config.mode === "emom"
                ? session.config.intervals
                : session.config.rounds}
            </p>
          )}
          {session.config.mode === "emom" && currentMovement && (
            <p className="text-2xl font-bold text-cyan-300">
              {currentMovement.reps ? `${currentMovement.reps} × ` : ""}
              {currentMovement.name}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {running ? (
              <button
                onClick={() => {
                  const timestamp = Date.now();
                  setNow(timestamp);
                  update({ clock: { ...session.clock, pausedAt: timestamp } });
                }}
              >
                Pause
              </button>
            ) : (
              <button
                className="bg-cyan-400 font-bold text-slate-950"
                onClick={() => start(view.phase === "done")}
              >
                {view.phase === "done"
                  ? "Restart timer"
                  : locked
                    ? "Resume"
                    : "Start timer"}
              </button>
            )}
            <button
              onClick={() => {
                if (window.confirm("Reset all workout progress?")) {
                  previousElapsed.current = 0;
                  setSession(initial());
                  try {
                    localStorage.removeItem(storageKey);
                  } catch {}
                }
              }}
            >
              Reset
            </button>
          </div>
          <button className="text-sm text-slate-300" onClick={unlockAudio}>
            Enable sound (best-effort)
          </button>
        </section>
        <details
          open={!locked}
          className="rounded-xl border border-slate-700 p-4"
        >
          <summary className="min-h-12 cursor-pointer py-3 font-semibold">
            Timer settings {locked && "(reset to change)"}
          </summary>
          <fieldset
            disabled={locked}
            className="grid gap-3 disabled:opacity-60"
          >
            <label className="grid gap-1">
              Mode
              <select
                value={session.config.mode}
                onChange={(e) => {
                  const mode = e.target.value as TimerConfig["mode"];
                  const configs: Record<TimerConfig["mode"], TimerConfig> = {
                    for_time: {
                      mode: "for_time",
                      capSeconds: workout.time_cap_seconds ?? undefined,
                    },
                    amrap: {
                      mode: "amrap",
                      durationSeconds: workout.time_cap_seconds ?? 1200,
                    },
                    emom: {
                      mode: "emom",
                      intervalSeconds: 60,
                      intervals: workout.rounds ?? 10,
                    },
                    tabata: { mode: "tabata", work: 20, rest: 10, rounds: 8 },
                    rest: { mode: "rest", seconds: 120 },
                  };
                  update({ config: configs[mode] });
                }}
              >
                {["for_time", "amrap", "emom", "tabata", "rest"].map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <TimerSettings
              config={session.config}
              onChange={(config) => update({ config })}
            />
          </fieldset>
        </details>
        <section className="grid gap-3">
          <h2 className="text-xl font-bold">Your score</h2>
          <div className="flex items-center justify-between gap-3">
            <button
              aria-label="Subtract round"
              onClick={() =>
                update({ rounds: Math.max(0, session.rounds - 1) })
              }
            >
              −
            </button>
            <p className="text-3xl font-bold">{session.rounds} rounds</p>
            <button
              aria-label="Add round"
              onClick={() => update({ rounds: session.rounds + 1 })}
            >
              +
            </button>
          </div>
          <label className="grid gap-1">
            Reps
            <input
              type="number"
              min="0"
              max="100000"
              value={session.reps}
              onChange={(e) =>
                update({
                  reps: Math.min(
                    100000,
                    Math.max(0, Math.floor(Number(e.target.value))),
                  ),
                })
              }
            />
          </label>
        </section>
        <section className="grid gap-4">
          <h2 className="text-xl font-bold">Movements & loads</h2>
          {workout.movements.map((movement, i) => {
            const target = movementLoad(movement, 0);
            const weight = session.weights[`${i}-0`] ?? target.weight;
            return (
              <article
                key={`${movement.movement_id}-${i}`}
                className="grid gap-3 rounded-xl bg-slate-900 p-4"
              >
                <MovementDemoSheet
                  movement={{ id: movement.movement_id, name: movement.name }}
                  className="text-xl font-bold"
                >
                  {movement.name}
                </MovementDemoSheet>
                <p>
                  {[
                    movement.sets && `${movement.sets} sets`,
                    movement.reps && `${movement.reps} reps`,
                    movement.distance_m && `${movement.distance_m}m`,
                    movement.calories && `${movement.calories} cal`,
                    movement.duration_seconds &&
                      `${movement.duration_seconds}s`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {movement.notes && (
                  <p className="text-slate-300">{movement.notes}</p>
                )}
                {workout.workout_type === "strength" ? (
                  <div
                    className="grid gap-2"
                    role="group"
                    aria-label={`${movement.name} sets`}
                  >
                    <div className="grid grid-cols-[3rem_1fr_4rem] text-sm text-slate-300">
                      <span>Set</span>
                      <span>
                        Weight ({units}) · {movement.reps ?? "?"} reps
                      </span>
                      <span>Done</span>
                    </div>
                    {Array.from(
                      { length: Math.min(100, movement.sets ?? 1) },
                      (_, j) => {
                        const key = `${i}-${j}`;
                        const load = movementLoad(movement, j);
                        const value = session.weights[key] ?? load.weight;
                        return (
                          <div
                            key={j}
                            className="grid grid-cols-[3rem_1fr_4rem] items-center gap-2"
                          >
                            <span>{j + 1}</span>
                            <label>
                              <span className="text-xs text-slate-300">
                                {load.label}
                              </span>
                              <input
                                aria-label={`${movement.name} set ${j + 1} weight (${units})`}
                                type="number"
                                min="0"
                                max="10000"
                                step="any"
                                value={value ?? ""}
                                onChange={(e) =>
                                  update({
                                    weights: {
                                      ...session.weights,
                                      [key]: Math.min(
                                        10000,
                                        Math.max(0, Number(e.target.value)),
                                      ),
                                    },
                                  })
                                }
                              />
                            </label>
                            <label className="grid min-h-12 min-w-12 place-items-center">
                              <span className="sr-only">Set {j + 1} done</span>
                              <input
                                type="checkbox"
                                className="size-6"
                                checked={session.done.includes(key)}
                                onChange={(e) => {
                                  if (e.target.checked && value === undefined)
                                    return;
                                  const timestamp = Date.now();
                                  unlockAudio();
                                  previousElapsed.current = -1;
                                  setNow(timestamp);
                                  setSession((s) => ({
                                    ...s,
                                    weights:
                                      value === undefined
                                        ? s.weights
                                        : { ...s.weights, [key]: value },
                                    done: e.target.checked
                                      ? [...s.done, key]
                                      : s.done.filter((id) => id !== key),
                                    ...(e.target.checked
                                      ? {
                                          config: {
                                            mode: "rest",
                                            seconds:
                                              s.config.mode === "rest"
                                                ? s.config.seconds
                                                : 120,
                                            readySeconds:
                                              s.config.readySeconds ?? 10,
                                          },
                                          clock: {
                                            startedAt: timestamp,
                                            pausedAt: null,
                                            accumulated: 0,
                                          },
                                        }
                                      : {}),
                                  }));
                                }}
                              />
                            </label>
                          </div>
                        );
                      },
                    )}
                  </div>
                ) : (
                  <label className="grid gap-1">
                    {target.label} ({units})
                    <input
                      aria-label={`${movement.name} working weight (${units})`}
                      type="number"
                      min="0"
                      max="10000"
                      step="any"
                      value={weight ?? ""}
                      onChange={(e) =>
                        update({
                          weights: {
                            ...session.weights,
                            [`${i}-0`]: Math.min(
                              10000,
                              Math.max(0, Number(e.target.value)),
                            ),
                          },
                        })
                      }
                    />
                  </label>
                )}
                {weight !== undefined && (
                  <PlateDisplay weight={weight} bar={bar} units={units} />
                )}
              </article>
            );
          })}
        </section>
        <details className="rounded-xl border border-slate-700 p-4">
          <summary className="min-h-12 cursor-pointer py-3 text-xl font-bold">
            Plate calculator
          </summary>
          <div className="grid gap-3">
            <label className="grid gap-1">
              Bar ({units})
              <select
                value={bar}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setBar(value);
                  try {
                    localStorage.setItem(barKey, String(value));
                  } catch {
                    setStorageWarning("Bar preference could not be saved.");
                  }
                }}
              >
                {BAR_OPTIONS[units].map((value) => (
                  <option key={value} value={value}>
                    {value} {units}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              Total weight ({units})
              <input
                type="number"
                min="0"
                max="10000"
                step="any"
                value={calculatorWeight}
                onChange={(e) => setCalculatorWeight(e.target.value)}
              />
            </label>
            {calculator && (
              <PlateDisplay
                weight={Number(calculatorWeight)}
                bar={bar}
                units={units}
              />
            )}
          </div>
        </details>
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            className="size-6"
            checked={session.rx}
            onChange={(e) => update({ rx: e.target.checked })}
          />
          Rx (uncheck for scaled)
        </label>
        <label className="grid gap-2">
          Notes
          <textarea
            className="min-h-24 rounded-xl border border-slate-500 bg-slate-900 p-3"
            maxLength={500}
            value={session.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </label>
        {workout.workout_type === "for_time" &&
          activeCap &&
          elapsed / 1000 - (session.config.readySeconds ?? 10) >= activeCap && (
            <label className="flex min-h-12 items-center gap-3">
              <input
                className="size-6"
                type="checkbox"
                checked={session.completedAtCap}
                onChange={(e) => update({ completedAtCap: e.target.checked })}
              />
              Completed all reps before the cap (otherwise log reps)
            </label>
          )}
        <button
          className="bg-cyan-400 text-xl font-bold text-slate-950"
          onClick={finish}
        >
          Finish & review result
        </button>
        <p className="text-sm text-slate-300">
          Review and save on the next screen. Exiting keeps your progress on
          this device.
        </p>
      </div>
    </main>
  );
}

function PlateDisplay({
  weight,
  bar,
  units,
}: {
  weight: number;
  bar: number;
  units: Units;
}) {
  const result = platesPerSide(weight, bar, PLATE_SETS[units]);
  return (
    <p className="text-sm text-cyan-200">
      {weight} {units} · {bar} {units} bar · per side:{" "}
      {result.plates.length ? result.plates.join(" + ") : "empty bar"}
      {result.remainder !== 0
        ? ` · ${result.remainder < 0 ? "below bar by" : "unloadable remainder"} ${Math.abs(result.remainder)} ${units}`
        : ""}
    </p>
  );
}

function TimerSettings({
  config,
  onChange,
}: {
  config: TimerConfig;
  onChange: (config: TimerConfig) => void;
}) {
  const fields: [string, string, number | undefined][] = [
    ["readySeconds", "Get ready (seconds)", config.readySeconds ?? 10],
  ];
  if (config.mode === "for_time")
    fields.push([
      "capSeconds",
      "Time cap (minutes, blank = none)",
      config.capSeconds === undefined ? undefined : config.capSeconds / 60,
    ]);
  if (config.mode === "amrap")
    fields.push([
      "durationSeconds",
      "AMRAP duration (minutes)",
      config.durationSeconds / 60,
    ]);
  if (config.mode === "emom")
    fields.push(
      ["intervalSeconds", "Every X seconds", config.intervalSeconds],
      ["intervals", "Intervals", config.intervals],
    );
  if (config.mode === "tabata")
    fields.push(
      ["work", "Work (seconds)", config.work],
      ["rest", "Rest (seconds)", config.rest],
      ["rounds", "Rounds", config.rounds],
    );
  if (config.mode === "rest")
    fields.push([
      "seconds",
      "Rest between sets (minutes)",
      config.seconds / 60,
    ]);
  return fields.map(([key, label, value]) => {
    const minutes = ["durationSeconds", "capSeconds", "seconds"].includes(key);
    return (
      <label key={key} className="grid gap-1">
        {label}
        <input
          type="number"
          step={minutes ? "any" : 1}
          min={key === "readySeconds" ? 0 : minutes ? 1 / 60 : 1}
          max={
            key === "readySeconds"
              ? 60
              : minutes
                ? 1440
                : key === "rounds" || key === "intervals"
                  ? 1000
                  : 86400
          }
          value={value ?? ""}
          onChange={(e) => {
            const candidate = {
              ...config,
              [key]:
                key === "capSeconds" && e.target.value === ""
                  ? undefined
                  : minutes
                    ? Math.round(Number(e.target.value) * 60)
                    : Number(e.target.value),
            };
            const parsed = configSchema.safeParse(candidate);
            if (parsed.success) onChange(parsed.data);
          }}
        />
      </label>
    );
  });
}
