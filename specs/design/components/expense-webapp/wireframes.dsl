screen MyExpenses "The employee's own saved expenses and running total"
  navbar "Expense Tracker"
  sidebar "My Expenses -> MyExpenses | Upload Receipt -> UploadReceipt"
  row
    card "Running Total | $1,284.50 | across 12 expenses"
    right
    button "Upload Receipt" primary -> UploadReceipt
  table "Date | Merchant | Total" -> ExpenseDetail
    row "2026-09-12 | Bridge Cafe | $18.40"
    row "2026-09-18 | Staples | $42.10"
    row "2026-09-25 | Riverside Kitchen | $27.00"

screen UploadReceipt "Upload a photo or PDF of a receipt"
  navbar "Expense Tracker"
  sidebar "My Expenses -> MyExpenses | Upload Receipt -> UploadReceipt"
  heading "Upload receipt"
  image "Drop a photo or PDF here"
  row
    right
    button "Cancel" -> MyExpenses
    button "Extract details" primary -> ReviewExpense

screen ReviewExpense "Correct the auto-extracted fields before saving"
  navbar "Expense Tracker"
  sidebar "My Expenses -> MyExpenses | Upload Receipt -> UploadReceipt"
  heading "Review expense"
  image "Uploaded receipt preview"
  input "Merchant"
  input "Date"
  input "Total"
  row
    right
    button "Cancel" -> MyExpenses
    button "Save expense" primary -> MyExpenses

screen ExpenseDetail "One saved expense and its original receipt"
  navbar "Expense Tracker"
  sidebar "My Expenses -> MyExpenses | Upload Receipt -> UploadReceipt"
  heading "Expense detail"
  card "Merchant | Riverside Kitchen"
  card "Date | 2026-09-25"
  card "Total | $27.00"
  image "Original receipt file"
  row
    right
    button "Back to list" -> MyExpenses

flow "Log an expense"
  role "Employee"
  description "An employee uploads a receipt, corrects the extracted fields, saves it, and reviews their list"
  MyExpenses
  UploadReceipt
  ReviewExpense
  ExpenseDetail
