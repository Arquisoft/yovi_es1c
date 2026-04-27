Feature: Sistema de amigos

  Background:
    Given I am logged in as "testuser_e2e"

  Scenario: Ver la página de amigos
    Given I navigate to "/friends"
    Then the page should have loaded
    And I should see the friends page

  Scenario: Buscar un usuario
    Given I navigate to "/friends"
    When I search for a user "otheruser"
    Then I should see search results