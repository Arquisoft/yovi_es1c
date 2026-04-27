Feature: Mensajes

  Background:
    Given I am logged in as "testuser_e2e"

  Scenario: Ver la bandeja de mensajes
    Given I navigate to "/messages"
    Then the page should have loaded
    And I should see the messages page

  Scenario: Escribir un mensaje
    Given I navigate to "/messages"
    When I type "Hola e2e!" in the message input
    Then the message input should contain "Hola e2e!"