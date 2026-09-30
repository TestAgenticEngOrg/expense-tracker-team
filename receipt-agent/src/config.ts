// Env, read once, in one place. Nothing else reads process.env directly.

// From x-aep.attachments in agent.afm.md — copied exactly.
export const ATTACHMENTS: { types: string[]; maxFiles: number; maxFileSizeMB: number } = {
  types: ["image/jpeg", "image/png", "application/pdf"],
  maxFiles: 1,
  maxFileSizeMB: 10,
};

export interface Config {
  port: number;
  modelEndpoint?: string;
  modelName?: string;
  modelApiKey?: string;
  modelApiFormat?: string;
  modelApiAuthScheme?: string;
  modelApiKeyHeader?: string;
}

export const config: Config = {
  port: Number(process.env.PORT ?? 9090),
  modelEndpoint: process.env.MODEL_ENDPOINT,
  modelName: process.env.MODEL_NAME,
  modelApiKey: process.env.MODEL_API_KEY,
  modelApiFormat: process.env.MODEL_API_FORMAT,
  modelApiAuthScheme: process.env.MODEL_API_AUTH_SCHEME,
  modelApiKeyHeader: process.env.MODEL_API_KEY_HEADER,
};

// The required model variables. None has a fallback — a default model id or
// endpoint would be right for one host and wrong for every other, so a
// missing one is reported, never guessed.
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!config.modelEndpoint) missing.push("MODEL_ENDPOINT");
  if (!config.modelName) missing.push("MODEL_NAME");
  if (!config.modelApiKey) missing.push("MODEL_API_KEY");
  if (!config.modelApiFormat) missing.push("MODEL_API_FORMAT");
  return missing;
}
