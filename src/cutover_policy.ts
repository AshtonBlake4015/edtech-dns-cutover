import { z } from "zod";

export const cutoverRequestSchema = z.object({
  domain: z.string().min(1),
  hostname: z.string().min(1),
  destination: z.string().min(1),
  ttl: z.number().int().min(60).max(300),
  scheduledAt: z.string().datetime(),
  courses: z.array(z.object({
    courseId: z.string().min(1),
    activeLearners: z.number().int().nonnegative(),
    nextDeadlineAt: z.string().datetime().nullable()
  })).min(1)
});

export type CutoverRequest = z.infer<typeof cutoverRequestSchema>;

export type CutoverDecision = {
  approved: boolean;
  reason: string;
  report: {
    courses: number;
    activeLearners: number;
    deadlinesInsideGuardWindow: number;
  };
};

const DEADLINE_GUARD_MS = 2 * 60 * 60 * 1000;

export function decideCutover(input: CutoverRequest): CutoverDecision {
  const scheduled = Date.parse(input.scheduledAt);
  const deadlinesInsideGuardWindow = input.courses.filter((course) => {
    if (!course.nextDeadlineAt || course.activeLearners === 0) return false;
    const deadline = Date.parse(course.nextDeadlineAt);
    return deadline >= scheduled && deadline <= scheduled + DEADLINE_GUARD_MS;
  }).length;
  const activeLearners = input.courses.reduce((sum, course) => sum + course.activeLearners, 0);

  return {
    approved: deadlinesInsideGuardWindow === 0,
    reason: deadlinesInsideGuardWindow === 0
      ? "No active course deadline falls within the two-hour cutover guard window."
      : "Move the cutover beyond the next active learner deadline.",
    report: { courses: input.courses.length, activeLearners, deadlinesInsideGuardWindow }
  };
}
