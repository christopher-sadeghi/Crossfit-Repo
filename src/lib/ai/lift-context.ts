import { z } from "zod";

import type { LiftMax } from "@/lib/benchmarks";
import { fromKgPrecise, type Units } from "@/lib/units";

export const liftMaxContextSchema = z.array(z.object({
  name: z.string(),
  movement_id: z.string(),
  one_rm: z.number(),
  units: z.enum(["lb", "kg"]),
  estimated: z.boolean(),
  date: z.string().nullable(),
}));

export function formatLiftMaxes(lifts: LiftMax[], units: Units): z.infer<typeof liftMaxContextSchema> {
  return lifts.flatMap((lift) => lift.oneRmKg == null ? [] : [{
    name: lift.name,
    movement_id: lift.movement_id,
    one_rm: fromKgPrecise(lift.oneRmKg, units),
    units,
    estimated: lift.isEstimated,
    date: lift.isEstimated ? lift.estimatedDate : lift.actualDate,
  }]);
}

export const LIFT_LOAD_RULE = `For a lift with a matching movement_id in lift_maxes, prescribe an appropriate percentage of that athlete's supplied 1RM, calculate the resulting load in the supplied units, and state both (for example "5x5 @ 75% (≈ 225 lb)"). Put the calculated, sensibly rounded numeric load in the load field and the percentage and resulting load in the movement notes or change reason. Identify estimated maxes as estimates and consider the max's date. Never invent or infer a 1RM for a missing lift, or transfer a max between different lifts; without a supplied max, say it is unknown and use conservative guidance instead of claiming a personalized percentage. Safety and never-harder constraints take precedence.`;
