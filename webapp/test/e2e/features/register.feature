Feature: Registro de usuario

  Scenario: Successful registration
    Given the register page is open
    When I enter "Alice" as the username and submit
    Then I should see a welcome message containing "Hello Alice"

  Scenario: Registro fallido con usuario ya existente
    Given the register page is open
    When I fill in the register username with "testuser"
    And I fill in the register password with "Password1!"
    And I fill in the confirm password with "Password1!"
    And I click the register button
    Then I should see a register error message

  Scenario: Registro fallido con contraseñas que no coinciden
    Given the register page is open
    When I fill in the register username with "anotheruser"
    And I fill in the register password with "Password1!"
    And I fill in the confirm password with "Different1!"
    And I click the register button
    Then I should see a password mismatch error