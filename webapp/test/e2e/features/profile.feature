Feature: Perfil de usuario

  Background:
    Given I am logged in as "testuser_e2e"

  Scenario: Ver el perfil propio
    Given I navigate to "/profile"
    Then the page should have loaded
    And I should see the profile page content

  Scenario: El perfil muestra el nombre de usuario
    Given I navigate to "/profile"
    Then I should see my username on the profile