Feature: Capture and retrieve executable work
  Scenario: Create and retrieve standalone work
    Given a standalone Action workspace
    When I capture executable work titled "Call the supplier"
    Then the open Action belongs to the Workspace and is retrievable

  Scenario: Explicit ownership overrides current context
    Given I am working inside Project "Kitchen"
    And another Project contains a parked Outcome
    When I capture work explicitly owned by that Outcome
    Then the Action belongs to that Outcome without reactivating it

  Scenario: Read work after its owner disappears
    Given an Action owned by an Outcome
    When that owner disappears from its original location
    Then retrieval returns the unchanged Action and leaves the Workspace untouched
