import assert from "node:assert/strict";
import test from "node:test";

import { coachRecipientId } from "./coach-recipient";

test("coach alerts go to the assigned coach, falling back to the gym owner", () => {
  assert.equal(coachRecipientId({ coach_id: "owner", assigned_coach_id: "staff" }), "staff");
  assert.equal(coachRecipientId({ coach_id: "owner", assigned_coach_id: null }), "owner");
});
