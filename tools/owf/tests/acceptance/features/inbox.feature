Feature: Capture and process unresolved input
  Scenario: Clarify a captured thought without resetting its age
    Given an unresolved captured Inbox thought
    When its text is clarified
    Then its identity and original capture time are unchanged

  Scenario: Resolve only after explicit caller completion
    Given an unresolved captured Inbox thought
    When an Action is successfully created from its meaning
    Then the Inbox Item remains in the current Inbox
    When the caller explicitly resolves the Inbox Item
    Then it is absent from the current Inbox

  Scenario: Preserve input after incomplete processing
    Given an unresolved captured Inbox thought
    And one intended result has been saved successfully
    When a later intended operation fails
    Then the earlier result remains saved
    And the Inbox Item remains available

  Scenario: Discard input that needs no retained result
    Given an unresolved captured Inbox thought
    When the caller explicitly discards it
    Then it is absent from the current Inbox
    And no resulting work object is created
