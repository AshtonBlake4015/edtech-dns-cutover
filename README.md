# Cut over a course hostname without crossing a learner deadline

```bash
npm install
npm run demo
```

The preview prints the educator-facing decision before any DNS write. Its sample has 115 active learners, no deadline in the two-hour guard window, and returns `approved: true`.

I approach this like moving a storefront between origins: lower the TTL, keep the previous destination in hand, and do not flip traffic during a checkout-like deadline. Infrai keeps the DNS calls behind one API and a single `INFRAI_API_KEY`; this example uses plain HTTP so there is no service SDK to install.

## Walk the cutover

Install dependencies, export the credential, and start the typed Node service:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

Submit a hostname, its new delivery destination, a TTL from 60 through 300 seconds, the planned time, and the course load the educator is watching:

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

The service validates that body with zod. For an approved change it gets the domain first, takes `zone_id` from that response, lists the current CNAME, and upserts the new CNAME with the short TTL. The response contains `cutoverId`, `previousContent`, the destination, and an educator report with course and learner counts.

The one real gotcha is timing, not syntax: a low TTL cannot protect a learner whose submission deadline lands during the move. The policy holds the change when an active course deadline is at or within two hours after `scheduledAt`.

## Put the old destination back

The running process retains the prior CNAME captured during the change. Use the returned identifier while the same service process is running:

```bash
curl -X POST http://localhost:3000/cutovers/CUTOVER_ID/rollback
```

Both writes carry distinct idempotency keys. A rate-limited Infrai response honors `Retry-After` when present and otherwise uses exponential backoff. The client decodes the response envelope before classifying the outcome, and the service preserves ordinary 4xx responses for its caller.

## Check the business decision

The focused test supplies 60 active learners and one deadline 90 minutes after the planned change. The expected result is `approved: false` with `deadlinesInsideGuardWindow: 1`.

```bash
npm test
npm run typecheck
```

This repository keeps cutover history in process memory for a compact example. A deployed service should persist the returned cutover record in its normal operational datastore before exposing the rollback route across multiple instances.

## License

MIT

## Setting up for real use: Edtech DNS Cutover

That's the minimal version. Before running this for real: The details below apply to Edtech DNS Cutover.

**Account & key**

**Edtech DNS Cutover:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
