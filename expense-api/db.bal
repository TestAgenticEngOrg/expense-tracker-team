import ballerina/log;
import ballerina/sql;
import ballerina/time;
import ballerina/uuid;
import ballerinax/postgresql;
import ballerinax/postgresql.driver as _;

// The expense-db platform resource. No `check` here: an unreachable database
// at construction time is captured as a value, never a panic, so the service
// itself still starts (and a request against it fails cleanly with a 500)
// rather than the whole process going down when the database is briefly
// unavailable.
final postgresql:Client|sql:Error dbClient = createDbClient();

function createDbClient() returns postgresql:Client|sql:Error {
    return new (
        host = resolvedDbHost,
        username = resolvedDbUser,
        password = resolvedDbPassword,
        database = resolvedDbName,
        port = resolvedDbPort,
        options = {connectTimeout: 5, loginTimeout: 5}
    );
}

// One place every handler goes through to reach the client, so a database
// outage becomes one error value rather than a scattered null check.
function requireDb() returns postgresql:Client|error {
    postgresql:Client|sql:Error dbc = dbClient;
    if dbc is sql:Error {
        return error("expense-db is unavailable", dbc);
    }
    return dbc;
}

// Startup schema setup. Logged and left rather than propagated: a database
// that is not reachable yet at boot must not crash a service the platform
// expects to start with no environment configured at all.
final error? schemaInit = initSchema();

function initSchema() returns error? {
    postgresql:Client|error dbc = requireDb();
    if dbc is error {
        log:printWarn("expense-db unreachable at startup; schema not verified", 'error = dbc);
        return;
    }
    sql:ExecutionResult|sql:Error expensesResult = dbc->execute(`
        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            merchant TEXT NOT NULL,
            expense_date TEXT NOT NULL,
            total NUMERIC(12,2) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL
        )
    `);
    if expensesResult is sql:Error {
        log:printWarn("could not ensure the 'expenses' table", 'error = expensesResult);
        return;
    }
    sql:ExecutionResult|sql:Error receiptsResult = dbc->execute(`
        CREATE TABLE IF NOT EXISTS receipts (
            id TEXT PRIMARY KEY,
            expense_id TEXT NOT NULL REFERENCES expenses(id),
            file_name TEXT NOT NULL,
            content_type TEXT NOT NULL,
            data BYTEA NOT NULL
        )
    `);
    if receiptsResult is sql:Error {
        log:printWarn("could not ensure the 'receipts' table", 'error = receiptsResult);
        return;
    }
    sql:ExecutionResult|sql:Error indexResult = dbc->execute(`
        CREATE INDEX IF NOT EXISTS expenses_employee_id_idx ON expenses (employee_id, created_at DESC)
    `);
    if indexResult is sql:Error {
        log:printWarn("could not ensure the expenses index", 'error = indexResult);
    }
}

// Saves a new expense with its receipt, stamping the caller's own subject as
// the owner. Nothing here is client-supplied.
function insertExpense(string employeeId, NewExpense payload, byte[] receiptBytes) returns ExpenseRow|error {
    postgresql:Client dbc = check requireDb();
    string expenseId = uuid:createRandomUuid().toString();
    string receiptId = uuid:createRandomUuid().toString();
    time:Utc createdAt = time:utcNow();

    sql:ParameterizedQuery insertExpenseQuery = `
        INSERT INTO expenses (id, employee_id, merchant, expense_date, total, created_at)
        VALUES (${expenseId}, ${employeeId}, ${payload.merchant}, ${payload.date}, ${payload.total}, ${createdAt})
    `;
    _ = check dbc->execute(insertExpenseQuery);

    sql:ParameterizedQuery insertReceiptQuery = `
        INSERT INTO receipts (id, expense_id, file_name, content_type, data)
        VALUES (${receiptId}, ${expenseId}, ${payload.receiptFileName}, ${payload.receiptContentType}, ${receiptBytes})
    `;
    _ = check dbc->execute(insertReceiptQuery);

    return {
        id: expenseId,
        employeeId: employeeId,
        merchant: payload.merchant,
        expenseDate: payload.date,
        total: payload.total,
        createdAt: createdAt,
        receiptFileName: payload.receiptFileName,
        receiptContentType: payload.receiptContentType
    };
}

// A page of the caller's own expenses, plus the running total across every
// one of them — never scoped to any employee id the client sent.
function listExpenses(string employeeId, int 'limit, int offset) returns ExpensePage|error {
    postgresql:Client dbc = check requireDb();

    int count = check dbc->queryRow(`SELECT COUNT(*) FROM expenses WHERE employee_id = ${employeeId}`);
    decimal runningTotal = check dbc->queryRow(
        `SELECT COALESCE(SUM(total), 0) FROM expenses WHERE employee_id = ${employeeId}`);

    sql:ParameterizedQuery listQuery = `
        SELECT e.id AS "id", e.employee_id AS "employeeId", e.merchant AS "merchant",
               e.expense_date AS "expenseDate", e.total AS "total", e.created_at AS "createdAt",
               r.file_name AS "receiptFileName", r.content_type AS "receiptContentType"
        FROM expenses e
        JOIN receipts r ON r.expense_id = e.id
        WHERE e.employee_id = ${employeeId}
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT ${'limit} OFFSET ${offset}
    `;
    stream<ExpenseRow, sql:Error?> resultStream = dbc->query(listQuery);
    ExpenseRow[] rows = [];
    check from ExpenseRow row in resultStream
        do {
            rows.push(row);
        };

    return {rows: rows, count: count, runningTotal: runningTotal};
}

// One of the caller's own expenses. `sql:NoRowsError` is the caller's signal
// for "not found or not theirs" — the two are indistinguishable on purpose.
function getExpense(string employeeId, string expenseId) returns ExpenseRow|error {
    postgresql:Client dbc = check requireDb();
    sql:ParameterizedQuery getQuery = `
        SELECT e.id AS "id", e.employee_id AS "employeeId", e.merchant AS "merchant",
               e.expense_date AS "expenseDate", e.total AS "total", e.created_at AS "createdAt",
               r.file_name AS "receiptFileName", r.content_type AS "receiptContentType"
        FROM expenses e
        JOIN receipts r ON r.expense_id = e.id
        WHERE e.id = ${expenseId} AND e.employee_id = ${employeeId}
    `;
    ExpenseRow row = check dbc->queryRow(getQuery);
    return row;
}

// The original receipt file for one of the caller's own expenses.
function getReceipt(string employeeId, string expenseId) returns ReceiptRow|error {
    postgresql:Client dbc = check requireDb();
    sql:ParameterizedQuery getQuery = `
        SELECT r.file_name AS "fileName", r.content_type AS "contentType", r.data AS "data"
        FROM receipts r
        JOIN expenses e ON e.id = r.expense_id
        WHERE e.id = ${expenseId} AND e.employee_id = ${employeeId}
    `;
    ReceiptRow row = check dbc->queryRow(getQuery);
    return row;
}
