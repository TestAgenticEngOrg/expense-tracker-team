import "./tracing.js"; // side effects: sets up the OTel exporter, before any model client exists.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import { config, missingConfig, ATTACHMENTS } from "./config.js";
import { runTurn, genAiSystem } from "./agent.js";
import { traceTurn } from "./tracing.js";

// receipt-agent declares `x-aep.memory.type: "client"` in its agent.afm.md:
// the CALLER (expense-webapp) holds the transcript, not this service. There is
// no conversation store here — never add one. Every /chat call is answered
// from exactly the message and attachments that arrived on it, which matches
// what the agent is: a single-turn extractor that never references any
// expense other than the one attached to the current message.

const BODY_CAP = 24 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

// Keep at most BODY_CAP. Past it, answer 413 ONCE and keep reading without
// keeping anything, so the client finishes sending and actually sees the 413 —
// destroying the request or closing the socket mid-upload resets the
// connection and the caller gets a network error instead. Past twice the cap,
// stop draining and drop it. Resolves null when the request was refused.
function readBody(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    const refuse = () => { over = true; chunks.length = 0; sendJson(res, 413, { error: "request too large" }); };
    if (Number(req.headers["content-length"] ?? 0) > BODY_CAP) refuse();
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * BODY_CAP) { req.destroy(); return; }
      if (over) return;
      if (size > BODY_CAP) { refuse(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(over ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
    req.on("close", () => { if (!req.complete) resolve(null); });
  });
}

type Attachment = { name: string; mediaType: string; data: string };

// The whole request vocabulary. A field outside it is refused, so a caller
// speaking a newer contract than this agent was built for hears so, instead of
// having the field silently ignored. `conversationId` is accepted and echoed
// back only — there is no store to resolve it against, per memory.type: client.
const BODY_FIELDS = new Set(["conversationId", "message", "attachments"]);

function validate(body: any): { message: string; attachments: Attachment[] } | { error: string } {
  const unknown = Object.keys(body ?? {}).find((key) => !BODY_FIELDS.has(key));
  if (unknown) return { error: `unknown field: ${unknown}` };
  const message = typeof body?.message === "string" ? body.message.trim() : null;
  const attachments: Attachment[] = Array.isArray(body?.attachments) ? body.attachments : [];
  if (message === null) return { error: "expected { message: string }" };
  if (attachments.length > 0 && !ATTACHMENTS) return { error: "this agent does not accept attachments" };
  if (message === "" && attachments.length === 0) return { error: "expected a message or attachments" };
  if (ATTACHMENTS && attachments.length > ATTACHMENTS.maxFiles) return { error: `at most ${ATTACHMENTS.maxFiles} files per message` };
  let total = 0;
  for (const a of attachments) {
    if (typeof a?.name !== "string" || typeof a?.mediaType !== "string" || typeof a?.data !== "string") return { error: "each attachment needs name, mediaType and data" };
    if (!ATTACHMENTS!.types.includes(a.mediaType)) return { error: `${a.name}: this agent does not accept ${a.mediaType}` };
    const bytes = Buffer.byteLength(a.data, "base64");
    if (bytes > ATTACHMENTS!.maxFileSizeMB * 1024 * 1024) return { error: `${a.name}: larger than ${ATTACHMENTS!.maxFileSizeMB} MB` };
    total += bytes;
  }
  if (total > 15 * 1024 * 1024) return { error: "the files together are over 15 MB" };
  return { message, attachments };
}

// Reads the AI SDK's APICallError body; returns null for anything else.
function guardrailBlock(err: unknown): { name: string; reason: string } | null {
  const body = (err as { responseBody?: string; data?: unknown })?.responseBody;
  if (!body) return null;
  try {
    const m = JSON.parse(body)?.message;
    if (m?.action !== "GUARDRAIL_INTERVENED") return null;
    return { name: m.interveningGuardrail ?? "guardrail", reason: m.actionReason ?? "refused by policy" };
  } catch { return null; }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? "";

  if (req.method === "GET" && url === "/healthz") {
    const missing = missingConfig();
    if (missing.length > 0) return sendJson(res, 503, { ok: false, missing });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST" || url !== "/chat") {
    res.statusCode = 404;
    res.end();
    return;
  }

  // Inbound: who is calling me. The gateway hands every turn a caller
  // identity under x-user-id once it has validated the caller's own token
  // (x-aep.identity.mode: on-behalf-of). A header Node saw TWICE arrives as
  // string[]; accepting it would key the turn by a joined value, so a
  // non-string is refused rather than coerced.
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string" || userId === "") {
    res.statusCode = 401;
    res.end();
    return;
  }

  const raw = await readBody(req, res);
  if (raw === null) return; // already answered (413) or the connection died

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: "expected { message: string }" });
  }
  const v = validate(parsed);
  if ("error" in v) return sendJson(res, 400, { error: v.error });
  const { message, attachments } = v;

  const conversationId =
    typeof (parsed as { conversationId?: unknown })?.conversationId === "string"
      ? (parsed as { conversationId: string }).conversationId
      : randomUUID();

  // memory.type: client — no load from a store. This turn's message and
  // attachments are the whole of what the model sees; there is no prior
  // history to append to or save afterwards.
  const user: ModelMessage = {
    role: "user",
    content: [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      ...attachments.map((a) => ({ type: "file" as const, data: a.data, mediaType: a.mediaType, filename: a.name })),
    ],
  };

  try {
    const turn = await traceTurn(
      { conversationId, model: config.modelName ?? "", system: genAiSystem, message },
      (hooks) => runTurn([user], hooks),
    );
    return sendJson(res, 200, { conversationId, text: turn.text, toolCalls: turn.toolCalls });
  } catch (err) {
    const g = guardrailBlock(err);
    if (g) return sendJson(res, 422, { error: g.reason, guardrail: g.name });
    const status = (err as { statusCode?: number })?.statusCode;
    if (attachments.length > 0 && (status === 400 || status === 413 || status === 415)) {
      console.error("model rejected attached files:", attachments.map((a) => `${a.name} (${a.mediaType})`), err);
      return sendJson(res, 422, { error: "the model could not read the attached file(s)", files: attachments.map((a) => a.name) });
    }
    console.error("chat turn failed:", err);
    return sendJson(res, 500, { error: "internal error" });
  }
}

const server = createServer();
server.on("request", (req, res) => {
  void handle(req, res).catch((err) => {          // the last line of defence:
    console.error("chat turn failed:", err);      // `void handle(...)` alone
    if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
    else res.destroy();                           // already streaming: cut it
  });
});

server.listen(config.port, () => {
  console.log(`receipt-agent listening on ${config.port}`);
});
