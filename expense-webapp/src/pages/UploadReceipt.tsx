import { useRef, useState, type DragEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, CircularProgress, PageContent, PageTitle, Stack, Typography } from "@wso2/oxygen-ui";
import { Upload as UploadIcon } from "@wso2/oxygen-ui-icons-react";
import {
  extractReceipt,
  RECEIPT_ATTACHMENT_MAX_FILE_SIZE_MB,
  RECEIPT_ATTACHMENT_TYPES,
} from "../api";
import { parseExtractedFields, readFileAsBase64 } from "../receiptExtraction";
import type { ReviewExpenseState } from "./ReviewExpense";

const ACCEPT = RECEIPT_ATTACHMENT_TYPES.join(",");

/**
 * UploadReceipt — drop or select a photo or PDF, then "Extract details" calls
 * receipt-agent's /chat with the attachment and navigates to ReviewExpense
 * with the proposed fields (wireframes.dsl).
 */
export function UploadReceiptPage(): ReactElement {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(candidate: File): string | null {
    if (!RECEIPT_ATTACHMENT_TYPES.includes(candidate.type as (typeof RECEIPT_ATTACHMENT_TYPES)[number])) {
      return `${candidate.name} is not a photo or PDF receipt-agent can read (jpeg, png or pdf).`;
    }
    if (candidate.size > RECEIPT_ATTACHMENT_MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `${candidate.name} is larger than ${RECEIPT_ATTACHMENT_MAX_FILE_SIZE_MB} MB.`;
    }
    return null;
  }

  function chooseFile(candidate: File | undefined) {
    if (!candidate) return;
    const problem = validate(candidate);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setFile(candidate);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    chooseFile(e.dataTransfer.files[0]);
  }

  async function onExtract() {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const data = await readFileAsBase64(file);
      const response = await extractReceipt({
        message: "Extract the merchant, date and total from this receipt.",
        attachments: [{ name: file.name, mediaType: file.type, data }],
      });
      const extracted = parseExtractedFields(response.text);
      const state: ReviewExpenseState = {
        receiptFileName: file.name,
        receiptContentType: file.type,
        receiptData: data,
        merchant: extracted.merchant,
        date: extracted.date,
        total: extracted.total,
        extractionNote:
          !extracted.merchant && !extracted.date && !extracted.total ? response.text : null,
      };
      navigate("/expenses/review", { state });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not extract details from that receipt. You can still enter them by hand.",
      );
    } finally {
      setExtracting(false);
    }
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Upload receipt</PageTitle.Header>
      </PageTitle>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => chooseFile(e.target.files?.[0])}
      />

      <Box
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        sx={{
          border: "2px dashed",
          borderColor: dragOver ? "primary.main" : "divider",
          borderRadius: 2,
          p: 6,
          textAlign: "center",
          cursor: "pointer",
          bgcolor: dragOver ? "action.hover" : "background.paper",
        }}
      >
        <UploadIcon size={32} />
        <Typography sx={{ mt: 2 }}>
          {file ? file.name : "Drop a photo or PDF here, or click to choose a file"}
        </Typography>
        {file ? (
          <Typography variant="caption" color="text.secondary">
            {(file.size / 1024).toFixed(0)} KB
          </Typography>
        ) : null}
      </Box>

      {error ? (
        <Typography color="error.main" sx={{ mt: 2 }}>
          {error}
        </Typography>
      ) : null}

      <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3 }}>
        <Button variant="outlined" onClick={() => navigate("/expenses")}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!file || extracting}
          startIcon={extracting ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => void onExtract()}
        >
          Extract details
        </Button>
      </Stack>
    </PageContent>
  );
}
