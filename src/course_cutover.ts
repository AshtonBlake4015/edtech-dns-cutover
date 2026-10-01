import { randomUUID } from "node:crypto";
import { decideCutover, type CutoverRequest } from "./cutover_policy.js";
import { InfraiDns } from "./infrai_dns.js";

export type CompletedCutover = {
  cutoverId: string;
  zoneId: string;
  hostname: string;
  previousContent: string;
  destination: string;
  ttl: number;
  decision: ReturnType<typeof decideCutover>;
};

export class CourseCutoverCoordinator {
  private readonly completed = new Map<string, CompletedCutover>();
  private readonly dns: InfraiDns;

  constructor(dns: InfraiDns) {
    this.dns = dns;
  }

  async cutOver(input: CutoverRequest): Promise<CompletedCutover | ReturnType<typeof decideCutover>> {
    const decision = decideCutover(input);
    if (!decision.approved) return decision;

    const domain = await this.dns.getDomain(input.domain);
    const records = await this.dns.listRecords(domain.zone_id);
    const current = records.find(
      (record) => record.record_type === "CNAME" && record.name === input.hostname
    );
    if (!current) throw new Error(`No current CNAME found for ${input.hostname}`);

    const cutoverId = randomUUID();
    await this.dns.upsertCname({
      zoneId: domain.zone_id,
      name: input.hostname,
      content: input.destination,
      ttl: input.ttl,
      idempotencyKey: `course-cutover-${cutoverId}`
    });

    const completed: CompletedCutover = {
      cutoverId,
      zoneId: domain.zone_id,
      hostname: input.hostname,
      previousContent: current.content,
      destination: input.destination,
      ttl: input.ttl,
      decision
    };
    this.completed.set(cutoverId, completed);
    return completed;
  }

  async rollBack(cutoverId: string): Promise<CompletedCutover> {
    const cutover = this.completed.get(cutoverId);
    if (!cutover) throw new Error("Cutover is not available in this service process");
    await this.dns.upsertCname({
      zoneId: cutover.zoneId,
      name: cutover.hostname,
      content: cutover.previousContent,
      ttl: cutover.ttl,
      idempotencyKey: `course-rollback-${cutoverId}`
    });
    return cutover;
  }
}
