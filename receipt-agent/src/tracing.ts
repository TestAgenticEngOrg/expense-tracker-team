// tracing.ts — imported for side effects from the top of main.ts, before
// anything creates a model client. Also exports traceTurn, which main.ts
// wraps every /chat turn in.
//
// Inert when the platform sets no AMP_OTEL_ENDPOINT / AMP_AGENT_API_KEY:
// receipt-agent still starts and serves turns with tracing off. Never fail
// startup over tracing.
import { context, trace, SpanKind, SpanStatusCode, type Span } from "@opentelemetry/api";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import type {
  LanguageModelCallEndEvent,
  LanguageModelCallStartEvent,
  LanguageModelUsage,
  ModelMessage,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from "ai";

const endpoint = process.env.AMP_OTEL_ENDPOINT;
const apiKey = process.env.AMP_AGENT_API_KEY;
const agentName = process.env.OTEL_SERVICE_NAME ?? "receipt-agent";

// Prompts, completions, tool arguments and results go on spans unless the
// platform sets this to "false". ON when unset, as Agent Manager's own
// instrumentation defaults.
const recordContent = process.env.TRACELOOP_TRACE_CONTENT !== "false";

const tracer = trace.getTracer("agent");

if (endpoint && apiKey) {
  const provider = new NodeTracerProvider({
    resource: new Resource({ "service.name": agentName }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${endpoint}/v1/traces`,
          headers: { "x-amp-api-key": apiKey },
        }),
      ),
    ],
  });
  provider.register();
  process.on("SIGTERM", () => {
    void provider.shutdown().finally(() => process.exit(0));
  });
}

export interface TurnHooks {
  onLanguageModelCallStart(e: LanguageModelCallStartEvent): void;
  onLanguageModelCallEnd(e: LanguageModelCallEndEvent): void;
  onToolExecutionStart(e: ToolExecutionStartEvent): void;
  onToolExecutionEnd(e: ToolExecutionEndEvent): void;
}

export interface TurnTrace {
  conversationId: string;
  model: string; // MODEL_NAME
  system: string; // "anthropic" | "openai"
  message: string; // this turn's user message
}

export async function traceTurn<T extends { text: string; usage: LanguageModelUsage }>(
  turn: TurnTrace,
  run: (hooks: TurnHooks) => Promise<T>,
): Promise<T> {
  const agent = tracer.startSpan(`invoke_agent ${agentName}`, {
    attributes: {
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.agent.name": agentName,
      "gen_ai.conversation.id": turn.conversationId,
      "gen_ai.system": turn.system,
      "gen_ai.request.model": turn.model,
    },
  });
  const parent = trace.setSpan(context.active(), agent);
  if (recordContent) {
    agent.setAttribute("gen_ai.input.messages", toMessages([{ role: "user", content: turn.message }]));
  }

  let chat: Span | undefined;
  const toolSpans = new Map<string, Span>();

  const hooks: TurnHooks = {
    onLanguageModelCallStart: (e) => {
      if (chat) {
        chat.setStatus({ code: SpanStatusCode.ERROR, message: "model call retried" });
        chat.end();
      }
      chat = tracer.startSpan(
        `chat ${e.modelId}`,
        {
          kind: SpanKind.CLIENT,
          attributes: {
            "gen_ai.operation.name": "chat",
            "gen_ai.system": turn.system,
            "gen_ai.request.model": e.modelId,
          },
        },
        parent,
      );
      if (recordContent) {
        chat.setAttribute("gen_ai.input.messages", toMessages(e.messages));
        if (e.instructions !== undefined) {
          chat.setAttribute(
            "gen_ai.system_instructions",
            typeof e.instructions === "string" ? e.instructions : JSON.stringify(e.instructions),
          );
        }
      }
    },
    onLanguageModelCallEnd: (e) => {
      if (!chat) return;
      chat.setAttributes({
        "gen_ai.response.model": e.modelId,
        "gen_ai.response.finish_reasons": [e.finishReason],
        "gen_ai.usage.input_tokens": e.usage.inputTokens ?? 0,
        "gen_ai.usage.output_tokens": e.usage.outputTokens ?? 0,
      });
      if (recordContent) {
        chat.setAttribute(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: e.content.flatMap(toPart) }]),
        );
      }
      chat.setStatus({ code: SpanStatusCode.OK });
      chat.end();
      chat = undefined;
    },
    onToolExecutionStart: (e) => {
      const span = tracer.startSpan(
        `execute_tool ${e.toolCall.toolName}`,
        {
          attributes: {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": e.toolCall.toolName,
            "gen_ai.tool.call.id": e.toolCall.toolCallId,
          },
        },
        parent,
      );
      if (recordContent) {
        span.setAttribute("gen_ai.tool.call.arguments", JSON.stringify(e.toolCall.input ?? {}));
      }
      toolSpans.set(e.toolCall.toolCallId, span);
    },
    onToolExecutionEnd: (e) => {
      const span = toolSpans.get(e.toolCall.toolCallId);
      if (!span) return;
      toolSpans.delete(e.toolCall.toolCallId);
      if (e.toolOutput.type === "tool-error") {
        span.setAttribute("error.type", "tool_error");
        span.setStatus({
          code: SpanStatusCode.ERROR,
          ...(recordContent ? { message: String(e.toolOutput.error) } : {}),
        });
      } else {
        if (recordContent) {
          span.setAttribute("gen_ai.tool.call.result", JSON.stringify(e.toolOutput.output ?? null));
        }
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
    },
  };

  try {
    const result = await run(hooks);
    agent.setAttributes({
      "gen_ai.usage.input_tokens": result.usage.inputTokens ?? 0,
      "gen_ai.usage.output_tokens": result.usage.outputTokens ?? 0,
    });
    if (recordContent) {
      agent.setAttribute("gen_ai.output.messages", toMessages([{ role: "assistant", content: result.text }]));
    }
    agent.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    agent.setAttribute("error.type", (err as Error)?.name ?? "Error");
    if (recordContent) {
      agent.recordException(err as Error);
      agent.setStatus({ code: SpanStatusCode.ERROR, message: String((err as Error)?.message ?? err) });
    } else {
      agent.setStatus({ code: SpanStatusCode.ERROR });
    }
    throw err;
  } finally {
    for (const span of [chat, ...toolSpans.values()]) {
      if (!span) continue;
      span.setStatus({ code: SpanStatusCode.ERROR, message: "turn ended before this step completed" });
      span.end();
    }
    agent.end();
  }
}

type Part =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_call_response"; id: string; response: unknown };

function toMessages(messages: ReadonlyArray<ModelMessage>): string {
  return JSON.stringify(
    messages.map((m) => ({
      role: m.role,
      parts: typeof m.content === "string"
        ? [{ type: "text", content: m.content }]
        : m.content.flatMap(toPart),
    })),
  );
}

function toPart(part: { type: string }): Part[] {
  const p = part as { type: string } & Record<string, unknown>;
  switch (p.type) {
    case "text":
      return [{ type: "text", content: String(p.text) }];
    case "tool-call":
      return [{ type: "tool_call", id: String(p.toolCallId), name: String(p.toolName), arguments: p.input }];
    case "tool-result":
      return [{ type: "tool_call_response", id: String(p.toolCallId), response: (p.output as { value?: unknown })?.value ?? p.output }];
    default:
      return [];
  }
}
