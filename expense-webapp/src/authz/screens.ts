/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// Adapted from thunder-authentication's screens.example.ts pattern for
// expense-webapp's own screens (specs/design/components/expense-webapp/
// wireframes.dsl), in RAIL ORDER — the order the DSL's sidebar and flow draw
// them. Everything else (ScreenRoute, reachableScreens, hasScopedReach, the
// fail-loudly check) is the pattern's, unchanged.
//
// UploadReceipt's `loads` is `null`: it calls only receipt-agent's /chat,
// which has no OpenAPI contract and so contributes no OperationKey at all —
// there is no expense-api operation this screen itself invokes. The write it
// leads to (submitExpense) is named on ReviewExpense below, whose "Save
// expense" button is the control that actually makes that call — naming it
// there is what keeps that route guard, and the button, in step with the
// contract. See the PR report for the full reasoning.

import { canCall } from "./core";
import { OPERATIONS, isOperationKey, type OperationKey } from "./operations.gen";

export interface ScreenRoute {
  readonly key: string;
  readonly label: string;
  readonly path: string;
  readonly loads: OperationKey | null;
  readonly public?: boolean;
}

/** The Employee's screens, in the wireframe's rail + flow order. */
export const SCREEN_ROUTES: readonly ScreenRoute[] = [
  { key: "myexpenses", label: "My Expenses", path: "/expenses", loads: "GET /me/expenses" },
  { key: "uploadreceipt", label: "Upload Receipt", path: "/expenses/upload", loads: null },
  {
    key: "reviewexpense",
    label: "Review Expense",
    path: "/expenses/review",
    loads: "POST /me/expenses",
  },
  {
    key: "expensedetail",
    label: "Expense Detail",
    path: "/expenses/:expenseId",
    loads: "GET /me/expenses/{expenseId}",
  },
];

for (const screen of SCREEN_ROUTES) {
  if (screen.loads !== null && !isOperationKey(screen.loads)) {
    throw new Error(
      `src/authz/screens.ts: screen "${screen.label}" loads "${screen.loads}", which ` +
        `no contract declares. Re-run \`npm run gen\`, or name the operation the ` +
        `way openapi.yaml spells it.`,
    );
  }
}

export function reachableScreens(
  scopes: ReadonlySet<string>,
  signedIn: boolean,
): readonly ScreenRoute[] {
  return SCREEN_ROUTES.filter((screen) => {
    if (screen.public) return true;
    if (screen.loads === null) return signedIn;
    return canCall(OPERATIONS[screen.loads], scopes, signedIn);
  });
}

export function hasScopedReach(scopes: ReadonlySet<string>, signedIn: boolean): boolean {
  return reachableScreens(scopes, signedIn).some((screen) => !screen.public && screen.loads !== null);
}
