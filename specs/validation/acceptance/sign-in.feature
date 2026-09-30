Feature: Sign-in and access to one's own expenses

  @story-1
  Rule: Only a signed-in employee may see or manage expenses

    Scenario: A signed-in employee reaches their own expense list
      Given Priya the employee has signed in
      When she opens her expense list
      Then she sees her own saved expenses

    @negative
    Scenario: A visitor who has not signed in cannot reach the expense list
      Given Priya the employee has not signed in
      When she tries to open the expense list
      Then she is not shown any saved expenses

  @story-1
  Rule: An employee never sees another employee's expenses

    @negative
    Scenario: One employee's expenses are invisible to another
      Given Priya the employee has saved an expense at "Bridge Cafe"
      And Dev the employee has signed in
      When Dev opens his own expense list
      Then he does not see the expense at "Bridge Cafe"
