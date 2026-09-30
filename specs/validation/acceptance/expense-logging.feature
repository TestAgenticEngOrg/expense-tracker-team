Feature: Logging an expense from a receipt

  @story-2 @story-3
  Rule: Uploading a receipt automatically proposes its merchant, date and total

    Scenario: A clear receipt is read automatically
      Given Priya the employee has a photo of a receipt from "Bridge Cafe" dated "2026-09-12" totalling "18.40"
      When she uploads that receipt photo
      Then the merchant, date and total are proposed as "Bridge Cafe", "2026-09-12" and "18.40"

    @negative
    Scenario: A field that cannot be confidently read is left blank
      Given Priya the employee has a photo of a receipt whose total is unreadably faded
      When she uploads that receipt photo
      Then the total is left blank for her to fill in herself

  @story-4
  Rule: The employee may correct any proposed field before saving

    Scenario: Priya fixes a misread merchant name
      Given Priya has uploaded a receipt and the merchant was proposed as "Bridge Cafe"
      When she corrects the merchant to "Bridge Cafe & Bakery" before saving
      Then the saved expense shows the merchant as "Bridge Cafe & Bakery"

  @story-5
  Rule: A saved expense is final

    Scenario: Saving an expense adds it to the employee's record
      Given Priya has corrected the proposed fields for a receipt from "Bridge Cafe"
      When she saves the expense
      Then her expense list includes an expense at "Bridge Cafe"

    @negative
    Scenario: A saved expense cannot be edited afterwards
      Given Priya has saved an expense at "Bridge Cafe" totalling "18.40"
      When she looks for a way to edit that saved expense
      Then no edit or delete option is offered for it

  @story-6 @story-7
  Rule: The employee's expense list shows a running total

    Scenario: The running total reflects every saved expense
      Given Priya has saved an expense at "Bridge Cafe" totalling "18.40"
      And Priya has saved an expense at "Staples" totalling "42.10"
      When she opens her expense list
      Then her running total is "60.50"

  @story-8
  Rule: The original receipt stays attached to its saved expense

    Scenario: Priya views the original receipt for a saved expense
      Given Priya has saved an expense at "Bridge Cafe" from an uploaded receipt photo
      When she opens that expense's detail
      Then she sees the original receipt photo she uploaded
