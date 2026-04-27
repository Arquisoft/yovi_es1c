Feature: Crear partida

  Background:
    Given I am logged in as "testuser_e2e"

  Scenario: Navegar al create-match desde home
    Given I am on the home page
    When I click the play link
    Then I should be on the create match page

  Scenario: Crear una partida local
    Given I am on the create match page
    When I select the local game mode
    And I click the start game button
    Then I should be on the game page

  Scenario: Crear una partida online inicia matchmaking
    Given I am on the create match page
    When I select the online game mode
    And I click the start game button
    Then I should be on the matchmaking page