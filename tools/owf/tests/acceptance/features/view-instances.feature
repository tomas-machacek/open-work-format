Feature: Operational View instances
  Scenario: Independent instances use a shared current definition
    Given a Workspace with a shared View definition and an Action
    When I create two View instances with the same title and definition
    Then the View instances have different identities
    When I change a column title in their shared definition
    Then both View instances show the current column title and retain their metadata
    And reading the Views leaves the entire Workspace unchanged
