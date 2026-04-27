Feature: Ranking / Leaderboard

  Background:
    Given I am logged in as "testuser_e2e"

  Scenario: Ver el leaderboard
    Given I navigate to "/ranking"
    Then the page should have loaded
    And I should see the leaderboard

  Scenario: El leaderboard tiene entradas
    Given I navigate to "/ranking"
    Then I should see at least one ranking entry