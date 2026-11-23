import assert from "node:assert/strict";
import test from "node:test";

import { gymOwnerRow } from "./gym-owner";

test("gymOwnerRow returns the owner row from a gym roster", () => {
  const owner = { id: "owner", gym_id: "owner", units: "lb" };
  const staff = { id: "staff", gym_id: "owner", units: "kg" };

  assert.equal(gymOwnerRow([staff, owner]), owner);
  assert.equal(gymOwnerRow([staff]), null);
  assert.equal(gymOwnerRow([]), null);
});
