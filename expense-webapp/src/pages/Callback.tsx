import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@wso2/oxygen-ui";
import { handleCallback } from "../authz/session";
import { APP_NAME } from "../appName";

/**
 * Finishes whichever OIDC leg landed on /callback — both the redirect leg and
 * a silent renew's hidden iframe register this same route
 * (thunder-authentication: "That ONE registered URI serves BOTH legs").
 * `handleCallback()` dispatches; it returns nothing, so this page renders from
 * the promise SETTLING, never from a value.
 */
export function CallbackPage(): ReactElement {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void handleCallback()
      .then(() => {
        if (live) navigate("/", { replace: true });
      })
      .catch((err: unknown) => {
        if (live) {
          setError(err instanceof Error ? err.message : "Sign-in could not be completed.");
        }
      });
    return () => {
      live = false;
    };
  }, [navigate]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        height: "100vh",
      }}
    >
      <Typography variant="h6">{APP_NAME}</Typography>
      {error ? (
        <Typography color="error.main">{error}</Typography>
      ) : (
        <>
          <CircularProgress size={28} />
          <Typography color="text.secondary">Finishing sign-in…</Typography>
        </>
      )}
    </Box>
  );
}
