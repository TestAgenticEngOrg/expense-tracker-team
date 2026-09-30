import { http, HttpResponse } from "msw";
import type { components } from "../src/generated/expense-api";

type Expense = components["schemas"]["Expense"];
type NewExpense = components["schemas"]["NewExpense"];

/** Everything a saved row needs internally — the public `Expense` shape, plus
 * ownership and the receipt bytes the API keeps but never returns from the
 * list or detail operations (only from getMyExpenseReceipt). */
type StoredExpense = Expense & { ownerId: string; receiptData: string };

// The caller this mock speaks for, shaped like the gateway assertion. Every
// seed row below is owned by them except one, which proves /me/ filtering
// (and the 404-not-403 rule for a row that exists but isn't the caller's)
// actually does something.
export const mockCaller = {
  userId: "01a0ab00-0000-7000-8000-000000000001",
  username: "test-employee",
};

// A 1x1 transparent PNG, standing in for a real receipt image in every seed
// row below — small enough to keep this file readable, valid enough to
// render in an <img>.
const PLACEHOLDER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function seedRow(
  id: string,
  merchant: string,
  date: string,
  total: number,
  fileName: string,
  ownerId: string = mockCaller.userId,
): StoredExpense {
  return {
    id,
    ownerId,
    merchant,
    date,
    total,
    createdAt: `${date}T09:00:00Z`,
    receiptFileName: fileName,
    receiptContentType: "image/png",
    receiptData: PLACEHOLDER_PNG,
  };
}

/**
 * Hold state in module scope so the app behaves like an app — a save shows up
 * in the very next list. Reset on every full page load (any reload, typed or
 * opened URL, a link that leaves the SPA): `setupWorker` resolves every
 * request in the page's own JS context, so only in-app navigation carries a
 * change forward (react-webapp mock-mode.md §3).
 *
 * The last 3 rows (Bridge Cafe, Staples, Riverside Kitchen) are exactly the
 * wireframe's drawn table rows; all 12 together sum to its stat card exactly
 * — $1,284.50 across 12 expenses — printed with wireframes' seed.mjs rather
 * than retyped.
 */
let expenses: StoredExpense[] = [
  seedRow("1", "Metro Taxi", "2026-01-05", 133.0, "metro-taxi.png"),
  seedRow("2", "OfficeMax", "2026-02-10", 133.0, "officemax.png"),
  seedRow("3", "Downtown Diner", "2026-03-03", 133.0, "downtown-diner.png"),
  seedRow("4", "Rideshare Co", "2026-03-20", 133.0, "rideshare-co.png"),
  seedRow("5", "Corner Deli", "2026-04-15", 133.0, "corner-deli.png"),
  seedRow("6", "QuickPrint", "2026-05-02", 133.0, "quickprint.png"),
  seedRow("7", "Airport Parking", "2026-06-18", 133.0, "airport-parking.png"),
  seedRow("8", "Hotel Meridian", "2026-07-09", 133.0, "hotel-meridian.png"),
  seedRow("9", "Gas & Go", "2026-08-01", 133.0, "gas-and-go.png"),
  seedRow("10", "Bridge Cafe", "2026-09-12", 18.4, "bridge-cafe.png"),
  seedRow("11", "Staples", "2026-09-18", 42.1, "staples.png"),
  seedRow("12", "Riverside Kitchen", "2026-09-25", 27.0, "riverside-kitchen.png"),
  // Somebody else's expense — never returned by /me/expenses, and a 404, not
  // a 403, if this id is ever requested directly.
  seedRow("13", "Someone Else's Lunch", "2026-09-01", 9.99, "someone-elses.png", "not-the-caller"),
];
let nextId = 14;

function toPublicExpense(stored: StoredExpense): Expense {
  const { ownerId: _ownerId, receiptData: _receiptData, ...rest } = stored;
  return rest;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const handlers = [
  // The caller's own expenses, paginated, with the running total across ALL
  // of them (not just this page) — exactly what listMyExpenses documents. No
  // `expenses:read` check: a caller who does not hold it was refused by
  // mock/authz/gateway.ts and never reached here.
  http.get("/api/me/expenses", ({ request }) => {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const mine = expenses.filter((e) => e.ownerId === mockCaller.userId);
    const page = mine.slice(offset, offset + limit);
    const runningTotal = mine.reduce((sum, e) => sum + e.total, 0);
    const nextOffset = offset + limit;

    return HttpResponse.json({
      count: mine.length,
      data: page.map(toPublicExpense),
      runningTotal: Math.round(runningTotal * 100) / 100,
      next: nextOffset < mine.length ? `/me/expenses?limit=${limit}&offset=${nextOffset}` : null,
      previous: offset > 0 ? `/me/expenses?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null,
    });
  }),

  http.post("/api/me/expenses", async ({ request }) => {
    const body = (await request.json()) as Partial<NewExpense>;
    if (
      !body?.merchant ||
      !body.date ||
      typeof body.total !== "number" ||
      !body.receiptFileName ||
      !body.receiptContentType ||
      !body.receiptData
    ) {
      return HttpResponse.json(
        { code: 400, message: "Missing or invalid merchant, date, total or receipt" },
        { status: 400 },
      );
    }
    const created: StoredExpense = {
      id: String(nextId++),
      ownerId: mockCaller.userId,
      merchant: body.merchant,
      date: body.date,
      total: body.total,
      createdAt: new Date().toISOString(),
      receiptFileName: body.receiptFileName,
      receiptContentType: body.receiptContentType,
      receiptData: body.receiptData,
    };
    expenses = [...expenses, created];
    return HttpResponse.json(toPublicExpense(created), { status: 201 });
  }),

  // Most-specific-first: this must be registered before the bare :expenseId
  // route below, or it would try to match "5/receipt" as a single :expenseId
  // segment. Owner + id resolved from the mock identity, never a query param.
  http.get("/api/me/expenses/:expenseId/receipt", ({ params }) => {
    const found = expenses.find((e) => e.id === params.expenseId);
    if (!found || found.ownerId !== mockCaller.userId) {
      return HttpResponse.json({ code: 404, message: "No such expense for the caller" }, { status: 404 });
    }
    return new HttpResponse(base64ToBytes(found.receiptData), {
      status: 200,
      headers: { "Content-Type": found.receiptContentType },
    });
  }),

  http.get("/api/me/expenses/:expenseId", ({ params }) => {
    const found = expenses.find((e) => e.id === params.expenseId);
    if (!found || found.ownerId !== mockCaller.userId) {
      return HttpResponse.json({ code: 404, message: "No such expense for the caller" }, { status: 404 });
    }
    return HttpResponse.json(toPublicExpense(found));
  }),

  // receipt-agent's one fixed /chat contract — an extra sibling, reached at
  // /api/receipt-agent/ (react-webapp: An ai-agent dependency has no OpenAPI
  // contract). A single canned extraction: enough for the walk to exercise
  // the full "upload -> extract -> correct -> save" journey without a real
  // model behind it.
  http.post("/api/receipt-agent/chat", () =>
    HttpResponse.json({
      conversationId: "mock-conversation-1",
      text: "Merchant: Riverside Kitchen\nDate: 2026-09-25\nTotal: 27.00",
      toolCalls: [],
    }),
  ),
];
