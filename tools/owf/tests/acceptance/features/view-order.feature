Feature: Persistent independent View column order
  Scenario: Reorder inferred members without changing Actions or another instance
    Given two ordering Views with Actions A, B, C and D in arrival order
    When I put D at position 3 and then B at position 3 in the first ordering View
    Then the first ordering View shows A, D, B, C
    And the second ordering View and all Actions retain their original organization and data

  Scenario: Cross-column insertion and a return use current destination order
    Given two ordering Views with Actions A, B, C and D in arrival order
    When I put D at position 3 and then B at position 3 in the first ordering View
    And I insert B first in Todo and return it without a position
    Then the first ordering View shows A, D, C, B
    And the second ordering View and all Actions retain their original organization and data

  Scenario: Create an Action in a chosen column without copying organization to another View
    Given two ordering Views with Actions A, B, C and D in arrival order
    When I create a new Action directly in Todo of the first ordering View
    Then the new Action is in Todo only in the chosen View and Open in the Workspace
