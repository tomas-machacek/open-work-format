Feature: Action execution state
  Scenario: Wait for a response, revise context, complete and reopen
    Given a standalone Action workspace
    When I capture executable work titled "Call supplier"
    And I set its execution state to "waiting" with reason "Supplier reply"
    Then its persisted execution state is "waiting" with reason "Supplier reply"
    When I set its execution state to "waiting" with reason "New reply date"
    Then its persisted execution state is "waiting" with reason "New reply date"
    When I set its execution state to "completed"
    Then its persisted execution state is "completed" without a waiting reason
    When I set its execution state to "open"
    Then its persisted execution state is "open" without a waiting reason

  Scenario Outline: Select any requested state within an owner scope
    Given mixed Action states under Kitchen, a nested Outcome and the Workspace
    When I select states "waiting,open,waiting" under Kitchen in <mode> mode
    Then the listed titles are exactly "<titles>"

    Examples:
      | mode      | titles              |
      | direct    | Open step           |
      | recursive | Open step,Wait step |
