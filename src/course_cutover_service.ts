import { createServer, type ServerResponse } from "node:http";
import { cutoverRequestSchema } from "./cutover_policy.js";
import { CourseCutoverCoordinator } from "./course_cutover.js";
import { InfraiDns, InfraiError } from "./infrai_dns.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const coordinator = new CourseCutoverCoordinator(new InfraiDns(apiKey));
const port = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/cutovers") {
      const parsed = cutoverRequestSchema.safeParse(await readJson(request));
      if (!parsed.success) return send(response, 400, { ok: false, issues: parsed.error.issues });
      const result = await coordinator.cutOver(parsed.data);
      if ("cutoverId" in result) {
        return send(response, 201, { ok: result.decision.approved, data: result });
      }
      return send(response, 409, { ok: result.approved, data: result });
    }

    const rollback = request.url?.match(/^\/cutovers\/([^/]+)\/rollback$/);
    if (request.method === "POST" && rollback) {
      const result = await coordinator.rollBack(rollback[1]);
      return send(response, 200, { ok: true, data: result });
    }
    return send(response, 404, { ok: false, message: "Route not found" });
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { ok: false, error: error.detail });
    }
    return send(response, 500, { ok: false, message: error instanceof Error ? error.message : "Unexpected error" });
  }
}).listen(port, () => {
  console.log(`Course cutover service listening on http://localhost:${port}`);
});
