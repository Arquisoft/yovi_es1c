Feature: Login de usuario

  Scenario: Login exitoso con credenciales válidas
    Given I am on the login page
    When I register a fresh user and return to login
    And I submit the login form
    Then I should be on the home page

  Scenario: Login fallido con credenciales incorrectas
    Given I am on the login page
    When I fill in the username with "wronguser"
    And I fill in the password with "wrongpassword"
    And I submit the login form
    Then I should see a login error

  Scenario: Redireccion al login si no autenticado
    Given I am not authenticated
    When I try to visit the home page
    Then I should be redirected to login