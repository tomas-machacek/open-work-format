Feature: Discover Actions by stored ownership
  Scenario Outline: Select direct or nested work from inside a deeply nested Outcome
    Given Actions owned by Workspace, Kitchen, two nested Outcomes and Kitchenette
    When I list Actions with owner "<owner>" and mode <mode>
    Then the listed titles are exactly "<titles>"

    Examples:
      | owner                       | mode      | titles                                      |
      | all                         | direct    | Workspace,Kitchen,Parent,Child,Kitchenette   |
      | /                           | direct    | Workspace                                   |
      | /_projects/kitchen/          | direct    | Kitchen                                     |
      | /_projects/kitchen/parent/   | direct    | Parent                                      |
      | /_projects/kitchen/          | recursive | Kitchen,Parent,Child                        |
      | /_projects/kitchen/parent/   | recursive | Parent,Child                                |
      | /                           | recursive | Workspace,Kitchen,Parent,Child,Kitchenette   |

  Scenario: Find text in open or waiting work inside a Project subtree
    Given searchable Actions across Kitchen, a nested Outcome and the Workspace
    When I search for "návrh" under Kitchen selecting states "open,waiting"
    Then the listed titles are exactly "NÁVRH kuchyne,Invoice"
