// Adapted from thunder-authentication's App.example.tsx pattern. The routing
// STRUCTURE below is prescribed (NoAccess above the shell and replacing it,
// Forbidden inside the shell, /callback outside the provider, every gated
// route wrapped in <RequireOperation> from SCREEN_ROUTES) — see the pattern
// file for why. expense-webapp declares no public screen (every screen in
// "Log an expense" carries role "Employee"), so PUBLIC_SCREENS is always
// empty here and the whole app sits behind sign-in.

import { useEffect, type ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@wso2/oxygen-ui";
import { AuthzProvider, Forbidden, NoAccess, RequireOperation, useAuthz, useScopes } from "./authz/gates";
import { SCREEN_ROUTES, reachableScreens, hasScopedReach } from "./authz/screens";
import { setForbiddenNavigator } from "./authz/client";
import { signIn } from "./authz/session";
import { AppShell } from "./shell/AppShell";
import { APP_NAME } from "./appName";
import { CallbackPage } from "./pages/Callback";
import { MyExpensesPage } from "./pages/MyExpenses";
import { UploadReceiptPage } from "./pages/UploadReceipt";
import { ReviewExpensePage } from "./pages/ReviewExpense";
import { ExpenseDetailPage } from "./pages/ExpenseDetail";

/** This app's pages, keyed by src/authz/screens.ts's screen keys. */
const PAGE_BY_KEY: Record<string, ReactElement> = {
  myexpenses: <MyExpensesPage />,
  uploadreceipt: <UploadReceiptPage />,
  reviewexpense: <ReviewExpensePage />,
  expensedetail: <ExpenseDetailPage />,
};

/** The screens reachable before sign-in — none, for this app. */
const PUBLIC_SCREENS = SCREEN_ROUTES.filter((screen) => screen.public);

export default function App(): ReactElement {
  return (
    <BrowserRouter>
      <ForbiddenWiring />
      <Routes>
        <Route path="/callback" element={<CallbackPage />} />
        {PUBLIC_SCREENS.map((screen) => (
          <Route
            key={screen.key}
            path={screen.path}
            element={<AuthzProvider fallback={<Splash />}>{PAGE_BY_KEY[screen.key]}</AuthzProvider>}
          />
        ))}
        <Route
          path="*"
          element={
            <AuthzProvider fallback={<Splash />}>
              <SignedIn />
            </AuthzProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

/** Hands src/authz/client.ts the route a refusal goes to, once. */
function ForbiddenWiring(): null {
  const navigate = useNavigate();
  useEffect(() => {
    setForbiddenNavigator(() => navigate("/forbidden", { replace: true }));
  }, [navigate]);
  return null;
}

function Splash(): ReactElement {
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
      <CircularProgress size={28} />
      <Typography color="text.secondary">Checking your session…</Typography>
    </Box>
  );
}

function SignedIn(): ReactElement {
  const { signedIn } = useAuthz();
  const scopes = useScopes();

  // Load-time guard: only a MISSING session starts a sign-in. currentUser()
  // already tried a silent renew, so signing in on a merely expired token
  // would re-log the user in on every visit.
  useEffect(() => {
    if (!signedIn) void signIn();
  }, [signedIn]);

  if (!signedIn) return <Splash />;

  const reachable = reachableScreens(scopes, signedIn);

  // NoAccess REPLACES the shell — no rail around "you have no access".
  if (!hasScopedReach(scopes, signedIn)) return <NoAccess appName={APP_NAME} />;

  const landing = (reachable.find((s) => !s.public && s.loads !== null) ?? reachable[0]).path;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={landing} replace />} />
        {SCREEN_ROUTES.map((screen) => {
          if (screen.public) return null;
          const page = PAGE_BY_KEY[screen.key];
          if (screen.loads === null) {
            return <Route key={screen.key} path={screen.path} element={page} />;
          }
          return (
            <Route key={screen.key} element={<RequireOperation op={screen.loads} screen={screen.label} />}>
              <Route path={screen.path} element={page} />
            </Route>
          );
        })}
        {/* Forbidden is INSIDE the shell: the rail the caller can use stays. */}
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="*" element={<Navigate to={landing} replace />} />
      </Route>
    </Routes>
  );
}
