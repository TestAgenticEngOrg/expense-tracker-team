import ballerina/lang.array;
import ballerina/time;

// The only receipt file types this service can later serve back — matching
// the content types `openapi.yaml`'s receipt endpoint declares.
final string[] ALLOWED_RECEIPT_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

final string:RegExp ISO_DATE_PATTERN = re `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`;

// Validates a `NewExpense` submission. Returns the decoded receipt bytes on
// success, or a short message naming the first problem found.
function validateNewExpense(NewExpense payload) returns byte[]|string {
    string merchant = payload.merchant.trim();
    if merchant == "" {
        return "merchant is required";
    }

    string? dateProblem = validateDate(payload.date);
    if dateProblem is string {
        return dateProblem;
    }

    decimal zeroAmount = 0;
    if payload.total <= zeroAmount {
        return "total must be a positive amount";
    }

    string fileName = payload.receiptFileName.trim();
    if fileName == "" {
        return "receiptFileName is required";
    }

    string contentType = payload.receiptContentType.trim();
    if ALLOWED_RECEIPT_CONTENT_TYPES.indexOf(contentType) is () {
        return "receiptContentType must be one of application/pdf, image/jpeg, image/png";
    }

    string receiptData = payload.receiptData.trim();
    if receiptData == "" {
        return "receiptData is required";
    }
    byte[]|error decoded = array:fromBase64(receiptData);
    if decoded is error {
        return "receiptData must be valid base64";
    }
    if decoded.length() == 0 {
        return "receiptData must not be empty";
    }

    return decoded;
}

// "YYYY-MM-DD", and a real calendar date — never merely well-formed.
function validateDate(string date) returns string? {
    string trimmed = date.trim();
    if !ISO_DATE_PATTERN.isFullMatch(trimmed) {
        return "date must be an ISO date (YYYY-MM-DD)";
    }
    string[] parts = re `-`.split(trimmed);
    int|error year = int:fromString(parts[0]);
    int|error month = int:fromString(parts[1]);
    int|error day = int:fromString(parts[2]);
    if year is error || month is error || day is error {
        return "date must be an ISO date (YYYY-MM-DD)";
    }
    time:Date candidate = {year, month, day, hour: 0, minute: 0, second: 0};
    time:Error? validated = time:dateValidate(candidate);
    if validated is time:Error {
        return "date is not a valid calendar date";
    }
    return ();
}
