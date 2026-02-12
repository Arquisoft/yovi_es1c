Feature: Nginx Reverse Proxy Integration
  Validate that Nginx correctly routes traffic

  Scenario: Nginx health check works
    Given the application is deployed
    When I request the nginx health check
    Then I should receive a healthy response

  Scenario: Webapp is accessible through Nginx
    Given the application is deployed
    When I visit the home page
    Then the page should load successfully
    And all JavaScript assets should load
    And all CSS assets should load

  Scenario: GameY service is accessible through proxy
    Given the application is deployed
    When I request "/api/gamey/status"
    Then the response should be successful
    And it should be proxied by Nginx

  Scenario: Nginx proxies requests correctly
    Given the application is deployed
    When I test all proxy endpoints
    Then "/api/gamey/status" should respond through proxy
    And the root path "/" should serve the webapp

  Scenario: Webapp bundle uses relative API paths
    Given the application is deployed
    When I inspect the webapp JavaScript bundle
    Then it should contain "/api/gamey"
    And it should not contain "localhost:4000"
    And it should not contain ":4000"

  Scenario: GameY bot API works through proxy
    Given the application is deployed
    When I make a bot move request to "/api/gamey/v1/ybot/choose/random_bot"
    Then the bot should respond with valid coordinates
    And the response should be in JSON format
    And it should be proxied through Nginx
