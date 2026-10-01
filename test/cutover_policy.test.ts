import assert from "node:assert/strict";
import test from "node:test";
import { decideCutover } from "../src/cutover_policy.js";

test("holds a cutover when active learners have a deadline in the next two hours", () => {
  const decision = decideCutover({
    domain: "school.example",
    hostname: "courses.school.example",
    destination: "delivery-v2.example.net",
    ttl: 120,
    scheduledAt: "2027-01-15T02:00:00.000Z",
    courses: [
      { courseId: "storefront-101", activeLearners: 42, nextDeadlineAt: "2027-01-15T03:30:00.000Z" },
      { courseId: "checkout-201", activeLearners: 18, nextDeadlineAt: "2027-01-15T08:00:00.000Z" }
    ]
  });

  assert.equal(decision.approved, false);
  assert.deepEqual(decision.report, {
    courses: 2,
    activeLearners: 60,
    deadlinesInsideGuardWindow: 1
  });
});
