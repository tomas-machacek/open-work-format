Feature: Organizing Actions independently in View instances
  Scenario: Same-state organization belongs to one instance
    Given two move Views sharing New, Todo and Blocked columns and an Open Action
    When I move the Action to Todo in the first instance
    Then it appears in Todo only in the first instance and New in the second
    And its state, content and update timestamp remain unchanged

  Scenario: A prerequisite prevents leaving Blocked
    Given two move Views sharing New, Todo and Blocked columns and an Open Action
    And the Action has an unresolved prerequisite and is explicitly placed in Blocked
    When I attempt to move the Action from Blocked to Todo
    Then the move is rejected without changing Action, placements or events
    When I complete the prerequisite and move the Action to Todo
    Then the Action is Open in Todo without a manual block
