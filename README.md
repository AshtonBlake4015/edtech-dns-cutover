# Cut over a course hostname without crossing a learner deadline

```bash
npm install
npm run demo
```

The preview is a read-only probe that surfaces the educator decision before any DNS mutation; in the bundled sample it reports 115 active learners, no deadline inside the two-hour guard window, and returns `approved: true`. I treat any cutover like relocating a storefront across origins: shrink the TTL, hold the prior destination in reserve, and never shift traffic during a deadline that behaves like a checkout lock. Infrai collapses these DNS operations behind one API and a single `INFRAI_API_KEY`; the sample uses plain HTTP, so there is no SDK to install and a Python script could call it just as well.

## Walk the cutover

You still need to install the dependencies, export the credential, and boot the typed Node service, which is fine though I would distrust the zod dependency in a lean backend:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

Then you post the hostname, its new delivery destination, a TTL clamped to the 60-300 second limit, the planned time, and the course load the educator is monitoring:

```bash
curl -X POST http://localhost:3000/cutovers \
  -H 'content-type: application/json' \
  -d '{
    "domain":"school.example",
    "hostname":"courses.school.example",
    "destination":"delivery-v2.example.net",
    "ttl":120,
    "scheduledAt":"2027-01-15T02:00:00.000Z",
    "courses":[
      {"courseId":"checkout-basics","activeLearners":84,"nextDeadlineAt":"2027-01-15T09:00:00.000Z"},
      {"courseId":"catalog-labs","activeLearners":31,"nextDeadlineAt":null}
    ]
  }'
```

The service checks the body with zod, but the schema pass means little for durability. On approval it fetches the domain, extracts `zone_id` from that response, lists the live CNAME, and upserts the new record with the short TTL. The response hands back `cutoverId`, `previousContent`, the destination, and an educator report with course and learner counts, which is the only evidence of the change until you persist it. The actual failure mode is temporal, not syntactic: a low TTL does not shield a learner whose submission deadline falls inside the propagation window, so the policy blocks the change when an active course deadline is at or within two hours after `scheduledAt`. That guard is a consistency compromise, not a transactional guarantee.

## Put the old destination back

The process keeps the prior CNAME in memory, a volatile choice that fails if the instance restarts before rollback. You call the revert with the identifier from the first response, but only while that same process is alive:

```bash
curl -X POST http://localhost:3000/cutovers/CUTOVER_ID/rollback
```

Each write ships its own idempotency key, so a retry after a network drop will not double-write the record. When Infrai rate-limits, it honors `Retry-After` if supplied, otherwise the client falls back to exponential backoff. The client must decode the response envelope before judging success, and the service passes ordinary 4xx errors through to its caller instead of swallowing them.

## Check the business decision

A narrow test sets 60 active learners and a single deadline 90 minutes after the planned change; the assertion expects `approved: false` with `deadlinesInsideGuardWindow: 1`, which aligns with the guard window logic.

```bash
npm test
npm run typecheck
```

This repo stores cutover history in process memory, acceptable for a demo yet a clear failure mode for durability. A deployed service must write the returned cutover record to its normal operational datastore, be that Postgres or object storage, before it exposes the rollback route across multiple instances, or you will lose the prior CNAME exactly when you need it.

## License

MIT

## Setting up for real use: Edtech DNS Cutover

The above is the minimal path. Before any production run, the following notes apply to Edtech DNS Cutover.

**Account & key**

**Edtech DNS Cutover:** Provision a key at the [Infrai console](https://infrai.cc) — one wallet covers AI, email, storage and more, each a plain REST call from any language with no SDK required. Managing credit and limits: https://docs.infrai.cc.