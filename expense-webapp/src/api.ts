// Same-origin API clients. nginx (nginx/default.conf) reverse-proxies /api to
// the expense-api sibling and /api/receipt-agent/ to the receipt-agent
// sibling — both through the API gateway when it is offered (react-webapp:
// Same-origin API proxy). This module adds NOTHING of its own about
// authorization: the bearer and the 401 rule both come from
// src/authz/client.ts (thunder-authentication §4).

import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./generated/expense-api";
import { authorizationHeader, classifyResponse, ForbiddenError } from "./authz/client";

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const header = await authorizationHeader();
    if (header) request.headers.set("Authorization", header);
    return request;
  },
  async onResponse({ response }) {
    if ((await classifyResponse(response.status)) === "forbidden") {
      throw new ForbiddenError(response.status);
    }
    return response;
  },
};

export const expenseApi = createClient<paths>({ baseUrl: "/api" });
expenseApi.use(authMiddleware);

// --- receipt-agent: one fixed webchat contract, no OpenAPI ------------------
//
// An ai-agent dependency has no OpenAPI contract — it is reached same-origin
// like any other sibling, at /api/<agent-component-name>/ because it is an
// EXTRA sibling here (expense-api is primary, at plain /api). Hand-written
// against the shape every platform agent speaks (react-webapp: An ai-agent
// dependency has no OpenAPI contract). This is a single-turn extraction, so no
// conversationId is persisted across calls.

export interface ChatAttachment {
  name: string;
  mediaType: string;
  /** base64-encoded file content */
  data: string;
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
  attachments?: ChatAttachment[];
}

export interface ChatResponse {
  conversationId: string;
  text: string;
  toolCalls: unknown[];
}

/** The receipt-agent's declared attachment contract (agent.afm.md, x-aep.attachments). */
export const RECEIPT_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const RECEIPT_ATTACHMENT_MAX_FILES = 1;
export const RECEIPT_ATTACHMENT_MAX_FILE_SIZE_MB = 10;

export class ReceiptAgentError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ReceiptAgentError";
    this.status = status;
  }
}

/** POST /api/receipt-agent/chat, with the same bearer and 401 rule as any sibling. */
export async function extractReceipt(request: ChatRequest): Promise<ChatResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const header = await authorizationHeader();
  if (header) headers.set("Authorization", header);

  const response = await fetch("/api/receipt-agent/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  const outcome = await classifyResponse(response.status);
  if (outcome === "forbidden") throw new ForbiddenError(response.status);
  if (outcome === "signin") throw new ReceiptAgentError(response.status, "Signing in…");

  if (!response.ok) {
    throw new ReceiptAgentError(
      response.status,
      `${response.status} ${response.statusText || "receipt extraction failed"}`,
    );
  }
  return (await response.json()) as ChatResponse;
}
