import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, stepCountIs, type ModelMessage, type LanguageModel } from "ai";
import type { TurnHooks } from "./tracing.js";
import { SYSTEM_PROMPT, MAX_ITERATIONS } from "./prompt.js";
import { tools } from "./tools.js";
import { config } from "./config.js";

// Filled from config once /healthz's required variables are all set.
export interface ModelSettings {
  format: string;      // MODEL_API_FORMAT
  baseURL: string;      // MODEL_ENDPOINT
  apiKey: string;       // MODEL_API_KEY
  modelName: string;    // MODEL_NAME
  keyHeader?: string;   // MODEL_API_KEY_HEADER — normally unset
  authScheme?: string;  // MODEL_API_AUTH_SCHEME
}

export function modelSettings(): ModelSettings {
  return {
    format: config.modelApiFormat ?? "",
    baseURL: config.modelEndpoint ?? "",
    apiKey: config.modelApiKey ?? "",
    modelName: config.modelName ?? "",
    keyHeader: config.modelApiKeyHeader,
    authScheme: config.modelApiAuthScheme,
  };
}

export function modelClient(
  { format, baseURL, apiKey, modelName, keyHeader, authScheme }: ModelSettings,
): LanguageModel {
  switch (format) {
    case "anthropic":
      return createAnthropic({
        baseURL,
        ...(keyHeader
          ? { apiKey: "unused", headers: { [keyHeader]: apiKey } } // SDK will not start without an apiKey
          : authScheme === "bearer"
            ? { authToken: apiKey }                                // Authorization: Bearer
            : { apiKey }),                                         // x-api-key
      })(modelName);
    case "openai-compatible":
      return createOpenAICompatible({
        name: "model",
        baseURL,
        includeUsage: true, // a streamed turn reports usage only when asked
        ...(keyHeader ? { headers: { [keyHeader]: apiKey } } : { apiKey }),
      })(modelName);
    default:
      throw new Error(`unsupported MODEL_API_FORMAT: ${format}`);
  }
}

export const genAiSystem = config.modelApiFormat === "openai-compatible" ? "openai" : "anthropic";

// A turn is ONE function, and it streams. The reply is still one JSON body;
// streaming is how the turn reaches the model, not how it reaches the caller.
export async function runTurn(messages: ModelMessage[], hooks: TurnHooks) {
  let failure: unknown;
  const result = streamText({
    model: modelClient(modelSettings()),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: stepCountIs(MAX_ITERATIONS),
    // A provider error arrives HERE, not as the rejection below.
    onError: ({ error }) => { failure ??= error; },
    ...hooks,
  });
  const [text, steps, toolCalls, usage] = await Promise.all([
    result.text, result.steps, result.toolCalls, result.totalUsage,
  ]).catch((err: unknown) => { throw failure ?? err; });
  if (failure !== undefined) throw failure;
  return { text, steps, toolCalls, usage };
}
