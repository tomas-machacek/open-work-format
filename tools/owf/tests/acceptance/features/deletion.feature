Feature: Permanent operational deletion
  Actions protect surviving prerequisites and Views own only their organization.

  Scenario: An incoming reference protects a completed prerequisite until explicitly removed
    Given a completed deletion prerequisite and a dependent Action
    When I try to delete the referenced prerequisite
    Then deletion is rejected and all operational data and history remain unchanged
    When I explicitly remove the dependency and delete the prerequisite
    Then only the dependent Action remains without that dependency

  Scenario: Deleting an Action removes it from every View while preserving remaining order
    Given two deletion Views with Actions A, B and C
    When I permanently delete Action B
    Then both deletion Views retain A and C in consecutive order

  Scenario: Deleting one populated instance preserves shared Actions and the other instance
    Given two deletion Views with Actions A, B and C
    When I delete the first populated deletion View
    Then the second deletion View and all three Actions remain
