Feature: Partida de juego

  Background:
    Given I am logged in as "testuser" with password "Test1234!"

  Scenario: Jugar una partida local contra la IA
    Given I start a local game with board size 9
    Then I should see the game board
    And I should see whose turn it is

  Scenario: Realizar un movimiento válido
    Given I am in an active local game
    When I click on a valid empty cell
    Then the cell should show my piece
    And the turn should change to the opponent

  Scenario: Intentar mover en una celda ocupada
    Given I am in an active local game with one move made
    When I click on an already occupied cell
    Then the board should not change

  Scenario: Fin de partida
    Given I am in a game that is about to end
    When the last valid move is made
    Then I should see the game result screen
    And I should see an option to return home