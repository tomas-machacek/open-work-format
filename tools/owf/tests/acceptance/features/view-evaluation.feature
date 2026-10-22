Feature: Read-only current View content
  Scenario: A View reflects current work without changing it
    Given a View with overlapping New and Todo columns, New as Open default, and Blocked
    And an unblocked Open Action and a manually blocked Open Action
    When I inspect the current View content
    Then the unblocked Action appears only in New and the blocked Action only in Blocked
    And Todo is empty and inspecting the View changed no data or events
    When I clear the View Action's manual block
    And I inspect the current View content
    Then both Actions appear only in New
    And Todo is empty and inspecting the View changed no data or events
