# Domain Model

The system tracks each employee's own expenses, each backed by the receipt it was extracted from.

```mermaid
erDiagram
    EMPLOYEE ||--o{ EXPENSE : owns
    EXPENSE ||--|| RECEIPT : "extracted from"

    EMPLOYEE {
        string id
        string email
    }
    EXPENSE {
        string id
        string employeeId
        string merchant
        string date
        number total
        string createdAt
    }
    RECEIPT {
        string id
        string expenseId
        string fileName
        string contentType
        binary data
    }
```

- **Employee** is the signed-in caller, identified by the Thunder-issued subject; the id is never chosen by the client.
- **Expense** is one saved, final record — merchant, date and total as the employee confirmed them. It is never edited or deleted after saving.
- **Receipt** is the original uploaded photo or PDF, kept alongside its Expense so the employee can view it later.

