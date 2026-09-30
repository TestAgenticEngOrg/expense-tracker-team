import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  PageContent,
  PageTitle,
  Stack,
  Typography,
  ListingTable,
} from "@wso2/oxygen-ui";
import { Upload } from "@wso2/oxygen-ui-icons-react";
import { expenseApi } from "../api";
import type { components } from "../generated/expense-api";

type Expense = components["schemas"]["Expense"];

const PAGE_SIZE = 20;

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * MyExpenses — the employee's own saved expenses and running total
 * (wireframes.dsl). Loads GET /me/expenses (scope expenses:read), paginated.
 */
export function MyExpensesPage(): ReactElement {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [count, setCount] = useState(0);
  const [runningTotal, setRunningTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pageOffset: number) => {
    setError(null);
    setExpenses(null);
    const { data, error: apiError } = await expenseApi.GET("/me/expenses", {
      params: { query: { limit: PAGE_SIZE, offset: pageOffset } },
    });
    if (apiError || !data) {
      setError("Could not load your expenses. Try reloading the page.");
      setExpenses([]);
      return;
    }
    setExpenses(data.data);
    setCount(data.count);
    setRunningTotal(data.runningTotal);
    setHasNext(Boolean(data.next));
  }, []);

  useEffect(() => {
    void load(offset);
  }, [load, offset]);

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>My Expenses</PageTitle.Header>
        <PageTitle.SubHeader>Your own saved expenses and running total</PageTitle.SubHeader>
        <PageTitle.Actions>
          <Button
            variant="contained"
            startIcon={<Upload size={18} />}
            onClick={() => navigate("/expenses/upload")}
          >
            Upload Receipt
          </Button>
        </PageTitle.Actions>
      </PageTitle>

      <Box sx={{ mb: 3, maxWidth: 320 }}>
        <Card>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Running Total
            </Typography>
            <Typography variant="h4">{currency.format(runningTotal)}</Typography>
            <Typography variant="caption" color="text.secondary">
              across {count} expense{count === 1 ? "" : "s"}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <ListingTable.Container elevation={0}>
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Date</ListingTable.Cell>
              <ListingTable.Cell>Merchant</ListingTable.Cell>
              <ListingTable.Cell>Total</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {expenses === null ? (
              <ListingTable.Row>
                <ListingTable.Cell colSpan={3}>Loading…</ListingTable.Cell>
              </ListingTable.Row>
            ) : expenses.length === 0 ? null : (
              expenses.map((expense) => (
                <ListingTable.Row
                  key={expense.id}
                  clickable
                  onClick={() => navigate(`/expenses/${expense.id}`)}
                >
                  <ListingTable.Cell>{expense.date}</ListingTable.Cell>
                  <ListingTable.Cell>{expense.merchant}</ListingTable.Cell>
                  <ListingTable.Cell>{currency.format(expense.total)}</ListingTable.Cell>
                </ListingTable.Row>
              ))
            )}
          </ListingTable.Body>
        </ListingTable>
        {expenses !== null && expenses.length === 0 && !error ? (
          <ListingTable.EmptyState
            title="No expenses yet"
            description="Upload a receipt to log your first expense."
          />
        ) : null}
      </ListingTable.Container>

      {error ? (
        <Typography color="error.main" sx={{ mt: 2 }}>
          {error}
        </Typography>
      ) : null}

      {expenses !== null && expenses.length > 0 ? (
        <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button variant="outlined" disabled={!hasNext} onClick={() => setOffset(offset + PAGE_SIZE)}>
            Next
          </Button>
        </Stack>
      ) : null}
    </PageContent>
  );
}
