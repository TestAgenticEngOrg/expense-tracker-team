import { useEffect, useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Box, Button, PageContent, PageTitle, Stack, StatCard, Typography } from "@wso2/oxygen-ui";
import { apiFetch } from "../authz/client";
import { expenseApi } from "../api";
import type { components } from "../generated/expense-api";

type Expense = components["schemas"]["Expense"];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * ExpenseDetail — one saved expense's merchant/date/total plus its original
 * receipt file. No edit or delete control anywhere (wireframes.dsl; hard
 * acceptance criterion of issue #7).
 */
export function ExpenseDetailPage(): ReactElement {
  const { expenseId } = useParams<{ expenseId: string }>();
  const navigate = useNavigate();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptContentType, setReceiptContentType] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expenseId) return;
    let objectUrl: string | null = null;
    let live = true;

    void (async () => {
      const { data, error: apiError, response } = await expenseApi.GET("/me/expenses/{expenseId}", {
        params: { path: { expenseId } },
      });
      if (!live) return;
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (apiError || !data) {
        setError("Could not load this expense.");
        return;
      }
      setExpense(data);

      try {
        const receiptResponse = await apiFetch(`/me/expenses/${expenseId}/receipt`);
        const blob = await receiptResponse.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!live) return;
        setReceiptUrl(objectUrl);
        setReceiptContentType(receiptResponse.headers.get("content-type"));
      } catch {
        if (live) setError((prev) => prev ?? "Could not load the receipt file.");
      }
    })();

    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [expenseId]);

  if (notFound) {
    return (
      <PageContent>
        <PageTitle>
          <PageTitle.Header>Expense detail</PageTitle.Header>
        </PageTitle>
        <Alert severity="warning" sx={{ mb: 2 }}>
          That expense was not found in your list.
        </Alert>
        <Button variant="outlined" onClick={() => navigate("/expenses")}>
          Back to list
        </Button>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Expense detail</PageTitle.Header>
      </PageTitle>

      {!expense ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : (
        <>
          <Stack spacing={2} sx={{ maxWidth: 320, mb: 3 }}>
            <StatCard label="Merchant" value={expense.merchant} />
            <StatCard label="Date" value={expense.date} />
            <StatCard label="Total" value={currency.format(expense.total)} />
          </Stack>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Original receipt file
          </Typography>
          {receiptUrl ? (
            receiptContentType?.startsWith("image/") ? (
              <Box
                component="img"
                src={receiptUrl}
                alt={expense.receiptFileName}
                sx={{ maxWidth: "100%", borderRadius: 1, border: "1px solid", borderColor: "divider" }}
              />
            ) : (
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
                <Typography sx={{ mb: 1 }}>{expense.receiptFileName}</Typography>
                <Button variant="outlined" size="small" component="a" href={receiptUrl} target="_blank" rel="noreferrer">
                  View receipt
                </Button>
              </Box>
            )
          ) : (
            <Typography color="text.secondary">Loading receipt…</Typography>
          )}
        </>
      )}

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 3 }}>
        <Button variant="outlined" onClick={() => navigate("/expenses")}>
          Back to list
        </Button>
      </Stack>
    </PageContent>
  );
}
