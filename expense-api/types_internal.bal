import ballerina/time;

// Internal row shapes — what the database hands back. The API-facing `Expense`
// (openapi_service.bal, generated) is assembled from this plus formatting.
public type ExpenseRow record {|
    string id;
    string employeeId;
    string merchant;
    string expenseDate;
    decimal total;
    time:Utc createdAt;
    string receiptFileName;
    string receiptContentType;
|};

public type ReceiptRow record {|
    string fileName;
    string contentType;
    byte[] data;
|};

// A page of the caller's own expenses plus the running total across ALL of
// their saved expenses (not just this page).
public type ExpensePage record {|
    ExpenseRow[] rows;
    int count;
    decimal runningTotal;
|};
