Feature: Estadísticas del usuario

  Background:
    Given I am logged in as "testuser_e2e"

  Scenario: Ver estadísticas propias
    Given I navigate to "/stats"
    Then the page should have loaded
    And I should see the stats section

  Scenario: Acceder a stats desde home
    Given I am on the home page
    When I click the stats link
    Then I should be on the stats page