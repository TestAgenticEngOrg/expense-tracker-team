import type { ReactElement } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  AppShell as OxygenAppShell,
  Header,
  Sidebar,
  Footer,
  UserMenu,
  ColorSchemeToggle,
  Divider,
} from "@wso2/oxygen-ui";
import { Receipt, Upload, LogOut } from "@wso2/oxygen-ui-icons-react";
import { APP_NAME } from "../appName";
import { Can, useAuthz } from "../authz/gates";
import { signOut } from "../authz/session";

/**
 * The app's ONE shell — sample/src/layouts/AppLayout.tsx's shape
 * (oxygen-ui-design-system: The sample app is the structure). Every gated
 * screen renders inside it, via <Outlet/>. The rail carries the two wireframe
 * sidebar items ("My Expenses -> MyExpenses | Upload Receipt -> UploadReceipt"
 * on every screen), each wrapped in <Can> so a caller who cannot reach one
 * never sees it — reproducing every per-role picture the DSL draws and also
 * covering a caller holding more than one role.
 */
export function AppShell(): ReactElement {
  const { pathname } = useLocation();
  const { username } = useAuthz();

  const active = pathname.startsWith("/expenses/upload")
    ? "uploadreceipt"
    : "myexpenses";

  return (
    <OxygenAppShell>
      <OxygenAppShell.Navbar>
        <Header>
          <Header.Toggle />
          <Header.Brand>
            <Header.BrandTitle>{APP_NAME}</Header.BrandTitle>
          </Header.Brand>
          <Header.Spacer />
          <Header.Actions>
            <ColorSchemeToggle />
            <Divider orientation="vertical" flexItem sx={{ mx: 2 }} />
            <UserMenu>
              <UserMenu.Trigger name={username || "Signed in"} />
              <UserMenu.Header name={username || "Signed in"} email="" />
              <UserMenu.Logout icon={<LogOut size={16} />} onClick={() => void signOut()} />
            </UserMenu>
          </Header.Actions>
        </Header>
      </OxygenAppShell.Navbar>

      <OxygenAppShell.Sidebar>
        <Sidebar activeItem={active}>
          <Sidebar.Nav>
            <Sidebar.Category>
              <Can op="GET /me/expenses">
                <Sidebar.Item id="myexpenses" link={<Link to="/expenses" />}>
                  <Sidebar.ItemIcon>
                    <Receipt size={18} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>My Expenses</Sidebar.ItemLabel>
                </Sidebar.Item>
              </Can>
              <Sidebar.Item id="uploadreceipt" link={<Link to="/expenses/upload" />}>
                <Sidebar.ItemIcon>
                  <Upload size={18} />
                </Sidebar.ItemIcon>
                <Sidebar.ItemLabel>Upload Receipt</Sidebar.ItemLabel>
              </Sidebar.Item>
            </Sidebar.Category>
          </Sidebar.Nav>
        </Sidebar>
      </OxygenAppShell.Sidebar>

      <OxygenAppShell.Main>
        <Outlet />
      </OxygenAppShell.Main>

      <OxygenAppShell.Footer>
        <Footer>
          <Footer.Copyright>© WSO2 LLC</Footer.Copyright>
        </Footer>
      </OxygenAppShell.Footer>
    </OxygenAppShell>
  );
}
