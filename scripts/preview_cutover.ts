import { decideCutover, cutoverRequestSchema } from "../src/cutover_policy.js";

const request = cutoverRequestSchema.parse({
  domain: "school.example",
  hostname: "courses.school.example",
  destination: "delivery-v2.example.net",
  ttl: 120,
  scheduledAt: "2027-01-15T02:00:00.000Z",
  courses: [
    { courseId: "checkout-basics", activeLearners: 84, nextDeadlineAt: "2027-01-15T09:00:00.000Z" },
    { courseId: "catalog-labs", activeLearners: 31, nextDeadlineAt: null }
  ]
});

console.log(JSON.stringify(decideCutover(request), null, 2));
