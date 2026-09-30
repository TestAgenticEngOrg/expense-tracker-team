// Runtime config, populated by the platform's /env-config.js at request time
// — never read at build time (react-webapp: Runtime config, not build-time).
//
// Only the `user-auth` platform-resource dependency's keys are declared: this
// app has no `external`-kind dependency and no `configurations.env` default.
// `USER_AUTH_JWKS_URL` is emitted too, but the browser never validates a
// token — the API gateway does — so no asset here reads it.
type Env = {
  USER_AUTH_CLIENT_ID: string;
  USER_AUTH_ISSUER: string;
  USER_AUTH_SCOPES: string;
  USER_AUTH_RESOURCE: string;
};

declare global {
  interface Window {
    _env_: Env;
  }
}

if (!window._env_) {
  throw new Error(
    "window._env_ not set — /env-config.js failed to load. " +
      "The platform mounts this file; if you see this locally, host " +
      "/env-config.js from your dev server.",
  );
}

export const env: Env = window._env_;
