# expense-tracker-team — PRD

## Problem Statement

A small team currently logs work expenses by hand: typing the merchant, date
and total off every paper or emailed receipt into a spreadsheet or form. It is
slow, error-prone, and each employee has to keep their own tally of what
they've spent.

## Solution

A simple expense tracker where an employee uploads a photo or PDF of a
receipt, has the merchant, date and total filled in automatically, corrects
anything that's wrong, and saves it. Each employee sees a list of their own
saved expenses with a running total. There are no approvals, no reports, and
no multi-currency support — just fast, accurate personal expense logging.

## Actors

- **Employee** — signs in, uploads receipts, reviews and corrects
auto-extracted expense data, saves expenses, and sees their own list of
saved expenses with a running total. Employees only ever see their own
expenses, never a teammate's.

## User Stories

1. As an employee, I want to sign in securely, so that only I can see and
 manage my own expenses.
2. As an employee, I want to upload a photo or PDF of a receipt, so that I
 don't have to type expense details from scratch.
3. As an employee, I want the merchant, date and total to be automatically
 extracted from my uploaded receipt, so that I save time on data entry.
4. As an employee, I want to review and correct the extracted merchant, date
 and total before saving, so that inaccurate extractions never end up in my
 records.
5. As an employee, I want to save a corrected expense, so that it becomes
 part of my expense record.
6. As an employee, I want to see a list of all my saved expenses, so that I
 can review my spending history.
7. As an employee, I want to see a running total of my saved expenses, so
 that I know how much I've spent overall.
8. As an employee, I want to view the original receipt file attached to a
 saved expense, so that I can double-check the details later.

## Product Decisions

- Sign-in is via SSO through Thunder, the platform IDP, as with every web app
on this platform.
- An AI agent reads the uploaded receipt photo or PDF and proposes the
merchant, date and total; the employee reviews and can correct any of the
three before saving. It runs on the organization's own model connection.
- If the agent cannot confidently read a field, that field is left blank for
the employee to fill in themselves rather than guessed.
Once saved, an expense record is final — there is no edit or delete after
saving.
- The uploaded receipt file is kept and stays attached to the saved expense,
so the employee can view the original later.
- A single currency is used throughout; no currency selection or conversion.
- There are no approval workflows and no reports — only the employee's own
list and running total.

## Out of Scope

- Editing or deleting a saved expense after it is saved.
- Any approval or review workflow by a manager or anyone other than the
employee themselves.
- Expense reports, exports, or analytics of any kind.
- Multiple currencies or currency conversion.
- Any visibility for one employee into another employee's expenses.

## Open Questions

None at this time.

## Further Notes

None.