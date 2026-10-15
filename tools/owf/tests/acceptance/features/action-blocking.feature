Feature: Independent manual blocks and Action prerequisites
  Scenario: Revise a manual reason independently from waiting and dependencies
    Given a standalone Action workspace
    And a waiting dependent Action with a manual block and an unfinished prerequisite
    When I replace its manual block with "Access restored tomorrow"
    Then its waiting context and prerequisite remain intact
    When I clear its manual block
    Then it remains dependency blocked without a manual reason

  Scenario: Complete prerequisites, clear manual blocking, then correct a target
    Given a standalone Action workspace
    And a waiting dependent Action with a manual block and an unfinished prerequisite
    When I try to complete the dependent Action
    Then the blocked edit is rejected unchanged
    When I cancel the prerequisite
    Then the dependent Action is still dependency blocked
    When I complete the prerequisite
    Then the dependent Action is blocked only manually
    When I clear the manual block and complete the dependent Action together
    Then the dependent Action is completed and unblocked
    When I reopen the prerequisite
    Then the completed dependent Action reports dependency blocking
    And unrelated edits and an unchanged completed request still succeed

  Scenario: Remove an obsolete prerequisite and manual reason while completing
    Given a standalone Action workspace
    And a waiting dependent Action with a manual block and an unfinished prerequisite
    When I clear the manual block, remove the prerequisite and complete together
    Then the dependent Action is completed and unblocked

  Scenario: Cancel blocked work only after consciously clearing its manual reason
    Given a standalone Action workspace
    And a waiting dependent Action with a manual block and an unfinished prerequisite
    When I cancel the dependent Action with an explicit manual clear
    Then it is cancelled and still dependency blocked

  Scenario: A completed direct target satisfies an edge even when it later becomes blocked
    Given a standalone Action workspace
    And a waiting dependent Action with a manual block and an unfinished prerequisite
    When I complete the prerequisite
    And I give the completed prerequisite an unfinished prerequisite
    Then the dependent Action is blocked only manually
