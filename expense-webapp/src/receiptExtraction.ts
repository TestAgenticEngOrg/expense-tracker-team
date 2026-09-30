// receipt-agent has a fixed webchat contract (agent.afm.md) — no structured
// JSON schema for its reply, just `text`. Its own instructions ask it to
// "Reply with the three fields and nothing else" as `merchant`, `date`,
// `total` labels, one per line, and to leave a field out entirely rather than
// guess it. This parses that terse reply into the three editable fields,
// leaving anything it cannot find blank — exactly what ReviewExpense is asked
// to pre-fill with (wireframes.dsl: "blank if a field couldn't be read").

export interface ExtractedFields {
  merchant: string;
  date: string;
  total: string;
}

const FIELD_PATTERNS: Record<keyof ExtractedFields, RegExp> = {
  merchant: /merchant\s*[:\-]\s*(.+)/i,
  date: /date\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i,
  total: /total\s*[:\-]\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
};

/** Parses the agent's reply text; any field it did not state comes back "". */
export function parseExtractedFields(text: string): ExtractedFields {
  const result: ExtractedFields = { merchant: "", date: "", total: "" };
  for (const line of text.split(/\r?\n/)) {
    for (const key of Object.keys(FIELD_PATTERNS) as (keyof ExtractedFields)[]) {
      if (result[key]) continue;
      const match = FIELD_PATTERNS[key].exec(line);
      if (match) result[key] = match[1].trim().replace(/,/g, "");
    }
  }
  return result;
}

/** Reads a File as a base64 string (no `data:` prefix). */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
