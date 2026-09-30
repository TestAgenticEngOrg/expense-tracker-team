// mockEnv carries exactly the keys the platform actually emits for this
// component (src/env.ts's Env type): this app's own `user-auth` OIDC keys.
// No sibling URL — expense-api and receipt-agent are both same-origin /api
// (react-webapp: Constraints).
export const mockEnv = {
  USER_AUTH_CLIENT_ID: "mock-client",
  USER_AUTH_ISSUER: "https://mock-idp.test",
  // singular `group`/`ou`, exactly as the platform requests them, plus the
  // project's own catalog handles.
  USER_AUTH_SCOPES: "openid profile email group ou expenses:read expenses:submit",
  USER_AUTH_RESOURCE: "https://mock-idp.test/resources/expense-tracker",
};
