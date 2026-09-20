Feature: Initialize a local Workspace

  @AC3
  Scenario: Initialize a named Workspace
    Given an existing directory outside any Workspace
    When I initialize it with the title "My work"
    Then it contains Workspace metadata with title "My work"
    And a navigation index and one initialization log entry exist
    And the declared local store has recognized schema version 2
    And the result identifies the directory as the Workspace root

  @AC4
  Scenario: Derive the title from the directory
    Given an existing directory named "personal" outside any Workspace
    When I initialize it without an explicit title
    Then the Workspace title is "personal"

  @AC5
  Scenario: Reject an empty explicit title
    Given an existing directory outside any Workspace
    When I initialize it with a whitespace-only title
    Then initialization fails with INVALID_TITLE
    And no Workspace artifacts are created

  @AC6
  Scenario Outline: Repeated initialization discovers the existing root
    Given an initialized Workspace with title "Original"
    And I am in its <location>
    When I initialize with the title "Different"
    Then the result is already_initialized with title "Original"
    And it identifies the existing Workspace root
    And existing Workspace artifacts are unchanged
    And no nested Workspace is created

    Examples:
      | location     |
      | root         |
      | subdirectory |

  @AC7
  Scenario: Preserve a conflicting README
    Given a directory outside any Workspace containing an ordinary README
    When I initialize that directory
    Then initialization fails with PATH_CONFLICT
    And all existing content is unchanged
    And no new Workspace artifacts are created

  @AC8
  Scenario: Do not replace a missing store
    Given an initialized Workspace whose declared store is missing
    When I initialize from a subdirectory
    Then initialization fails with STORE_UNAVAILABLE
    And no replacement store or nested Workspace is created
