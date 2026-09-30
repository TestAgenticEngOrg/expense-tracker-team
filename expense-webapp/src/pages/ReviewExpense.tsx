import { useMemo, useState, type ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Form,
  PageContent,
  PageTitle,
  Stack,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { expenseApi } from "../api";

export interface ReviewExpenseState {
  receiptFileName: string;
  receiptContentType: string;
  /** base64-encoded file content */
  receiptData: string;
  merchant: string;
  date: string;
  total: string;
  /** The agent's own reply, when none of the three fields could be parsed from it. */
  extractionNote: string | null;
}

/**
 * ReviewExpense — the uploaded receipt preview plus editable Merchant/Date/
 * Total, pre-filled from receipt-agent's extraction and blank where it could
 * not read a field. "Save expense" calls expense-api's submitExpense
 * (scope expenses:submit) with the receipt file base64-encoded plus the
 * corrected fields, then returns to MyExpenses (wireframes.dsl).
 */
export function ReviewExpensePage(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ReviewExpenseState | null;

  const [merchant, setMerchant] = useState(state?.merchant ?? "");
  const [date, setDate] = useState(state?.date ?? "");
  const [total, setTotal] = useState(state?.total ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (!state) return null;
    return `data:${state.receiptContentType};base64,${state.receiptData}`;
  }, [state]);

  if (!state) {
    return (
      <PageContent>
        <PageTitle>
          <PageTitle.Header>Review expense</PageTitle.Header>
        </PageTitle>
        <Alert severity="warning" sx={{ mb: 2 }}>
          There is no receipt to review yet.
        </Alert>
        <Button variant="contained" onClick={() => navigate("/expenses/upload")}>
          Upload a receipt
        </Button>
      </PageContent>
    );
  }

  const totalNumber = Number(total);
  const canSave =
    merchant.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    total.trim().length > 0 &&
    Number.isFinite(totalNumber);

  async function onSave() {
    if (!state) return;
    setSaving(true);
    setError(null);
    const { error: apiError } = await expenseApi.POST("/me/expenses", {
      body: {
        merchant: merchant.trim(),
        date,
        total: totalNumber,
        receiptFileName: state.receiptFileName,
        receiptContentType: state.receiptContentType,
        receiptData: state.receiptData,
      },
    });
    setSaving(false);
    if (apiError) {
      setError(
        (apiError as { message?: string }).message ??
          "Could not save this expense. Check the fields and try again.",
      );
      return;
    }
    navigate("/expenses");
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Review expense</PageTitle.Header>
      </PageTitle>

      {state.extractionNote ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          receipt-agent could not read this receipt: {state.extractionNote}
        </Alert>
      ) : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Uploaded receipt preview
          </Typography>
          {state.receiptContentType.startsWith("image/") ? (
            <Box
              component="img"
              src={previewUrl ?? undefined}
              alt={state.receiptFileName}
              sx={{ maxWidth: "100%", borderRadius: 1, border: "1px solid", borderColor: "divider" }}
            />
          ) : (
            <Box
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                p: 2,
              }}
            >
              <Typography sx={{ mb: 1 }}>{state.receiptFileName}</Typography>
              <Button
                variant="outlined"
                size="small"
                component="a"
                href={previewUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                View PDF
              </Button>
            </Box>
          )}
        </Box>

        <Box sx={{ flex: 1 }}>
          <Form.Section>
            <Form.Stack>
              <TextField
                label="Merchant"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                fullWidth
              />
              <TextField
                label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Total"
                type="number"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                fullWidth
              />
            </Form.Stack>
          </Form.Section>

          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}

          <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3 }}>
            <Button variant="outlined" onClick={() => navigate("/expenses")}>
              Cancel
            </Button>
            <Button variant="contained" disabled={!canSave || saving} onClick={() => void onSave()}>
              Save expense
            </Button>
          </Stack>
        </Box>
      </Stack>
    </PageContent>
  );
}
