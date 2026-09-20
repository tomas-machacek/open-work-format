Feature: Create durable Project and Outcome context
  Scenario: Create a Project while working inside another Project
    Given I am working inside Project "Kitchen"
    When I create a Project titled "Garden"
    Then an active Project "Garden" exists directly in the Workspace project collection
    And the existing Project is unchanged

  Scenario: Explicit ownership overrides current context
    Given I am working inside Project "Kitchen"
    And Project "Garden" exists in the same Workspace
    When I create an Outcome titled "Design approved" owned by Project Garden
    Then the new active Outcome belongs to Project Garden
    And its expected result is "Design approved"

  Scenario: No implicit Workspace-owned Outcome
    Given an initialized Workspace with title "Work"
    When I create an Outcome without selecting an owner
    Then creation fails because an owner is required
    And existing Workspace artifacts are unchanged

  Scenario: Existing agent guidance is preserved
    Given an initialized Workspace with user-edited agent guidance
    When I initialize that directory
    Then all existing content is unchanged
