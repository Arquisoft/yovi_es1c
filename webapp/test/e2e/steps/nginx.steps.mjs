import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

Given('the application is deployed', async function () {
    const response = await this.page.request.get('http://localhost/health');
    assert.strictEqual(response.status(), 200, 'Docker services not running');
});

When('I request the nginx health check', async function () {
    this.healthResponse = await this.page.request.get('http://localhost/health');
});

Then('I should receive a healthy response', async function () {
    assert.strictEqual(this.healthResponse.status(), 200);
    const text = await this.healthResponse.text();
    assert.ok(text.includes('healthy'), `Expected "healthy", got: "${text}"`);
});

When('I visit the home page', async function () {
    this.failedRequests = [];
    this.page.on('requestfailed', request => {
        this.failedRequests.push(request.url());
    });

    await this.page.goto('http://localhost/', { waitUntil: 'networkidle' });
});

Then('the page should load successfully', async function () {
    const title = await this.page.title();
    assert.ok(title.length > 0, 'Page title is empty');
});

Then('all JavaScript assets should load', async function () {
    const jsFailures = this.failedRequests.filter(url => url.endsWith('.js'));
    assert.strictEqual(
        jsFailures.length,
        0,
        `Failed JS assets: ${jsFailures.join(', ')}`
    );
});

Then('all CSS assets should load', async function () {
    const cssFailures = this.failedRequests.filter(url => url.endsWith('.css'));
    assert.strictEqual(
        cssFailures.length,
        0,
        `Failed CSS assets: ${cssFailures.join(', ')}`
    );
});

When('I request {string}', async function (endpoint) {
    const url = `http://localhost${endpoint}`;
    this.proxyResponse = await this.page.request.get(url);
    this.proxyUrl = url;
});

Then('the response should be successful', async function () {
    const status = this.proxyResponse.status();
    assert.ok(
        status >= 200 && status < 300,
        `Expected 2xx status but got ${status} for ${this.proxyUrl}`
    );
});

Then('it should be proxied by Nginx', async function () {
    const status = this.proxyResponse.status();
    assert.ok(status !== undefined, 'No response from proxy');
});

When('I test all proxy endpoints', async function () {
    this.endpointResults = {};

    try {
        const gameyResponse = await this.page.request.get('http://localhost/api/gamey/status');
        this.endpointResults['/api/gamey/status'] = {
            status: gameyResponse.status(),
            success: gameyResponse.ok(),
            body: await gameyResponse.text()
        };
    } catch (e) {
        this.endpointResults['/api/gamey/status'] = { error: e.message };
    }

    try {
        const webappResponse = await this.page.request.get('http://localhost/');
        this.endpointResults['/'] = {
            status: webappResponse.status(),
            success: webappResponse.ok()
        };
    } catch (e) {
        this.endpointResults['/'] = { error: e.message };
    }
});

Then('{string} should respond through proxy', async function (endpoint) {
    const result = this.endpointResults[endpoint];

    assert.ok(result, `No test result for ${endpoint}`);
    assert.ok(!result.error, `Request failed: ${result.error}`);
    assert.ok(result.status, `No status code received for ${endpoint}`);
    assert.strictEqual(result.status, 200, `Expected 200 but got ${result.status} for ${endpoint}`);
});

Then('the root path {string} should serve the webapp', async function (path) {
    const result = this.endpointResults[path];

    assert.ok(result, `No test result for ${path}`);
    assert.ok(!result.error, `Request failed: ${result.error}`);
    assert.strictEqual(result.status, 200, `Expected 200 but got ${result.status}`);

});

When('I inspect the webapp JavaScript bundle', async function () {
    await this.page.goto('http://localhost/', { waitUntil: 'networkidle' });

    const html = await this.page.content();
    const scriptMatches = html.matchAll(/src="([^"]+\.js)"/g);
    const scriptPaths = Array.from(scriptMatches).map(match => match[1]);

    this.bundleContent = '';

    for (const scriptPath of scriptPaths) {
        const scriptUrl = scriptPath.startsWith('http')
            ? scriptPath
            : `http://localhost${scriptPath}`;

        try {
            const response = await this.page.request.get(scriptUrl);
            if (response.ok()) {
                const content = await response.text();
                this.bundleContent += content + '\n';
            }
        } catch (e) {
        }
    }

});

Then('it should contain {string}', async function (needle) {
    const found = this.bundleContent.includes(needle);

    if (found) {
        const index = this.bundleContent.indexOf(needle);
        const context = this.bundleContent.substring(index - 20, index + needle.length + 20);
    }

    assert.ok(found, `Expected bundle to contain "${needle}"`);
});

Then('it should not contain {string}', async function (needle) {
    const found = this.bundleContent.includes(needle);


        const index = this.bundleContent.indexOf(needle);
        const context = this.bundleContent.substring(index - 20, index + needle.length + 20);


    assert.ok(!found, `Bundle should NOT contain "${needle}"`);
});

When('I make a bot move request to {string}', async function (endpoint) {
    const url = `http://localhost${endpoint}`;


    const yenState = {
        size: 3,
        turn: 0,
        players: ["B", "R"],
        layout: "./../..."
    };

    try {
        this.botResponse = await this.page.request.post(url, {
            data: yenState,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.botUrl = url;
        this.botStatus = this.botResponse.status();
        this.botBody = await this.botResponse.text();

        try {
            this.botJson = JSON.parse(this.botBody);
        } catch (e) {
            this.botJson = null;
        }
    } catch (e) {
        throw e;
    }
});

Then('the bot should respond with valid coordinates', async function () {
    assert.strictEqual(
        this.botStatus,
        200,
        `Expected 200 but got ${this.botStatus}. Response: ${this.botBody}`
    );

    assert.ok(this.botJson, 'Response should be valid JSON');
    assert.ok('coords' in this.botJson, 'Response should have "coords" property');

    const coords = this.botJson.coords;
    assert.ok(coords, 'Coords should not be null');
    assert.ok('x' in coords, 'Coords should have x property');
    assert.ok('y' in coords, 'Coords should have y property');
    assert.ok('z' in coords, 'Coords should have z property');

    assert.ok(
        typeof coords.x === 'number' && coords.x >= 0 && coords.x <= 2,
        `Invalid x coordinate: ${coords.x}`
    );
    assert.ok(
        typeof coords.y === 'number' && coords.y >= 0 && coords.y <= 2,
        `Invalid y coordinate: ${coords.y}`
    );
    assert.ok(
        typeof coords.z === 'number' && coords.z >= 0 && coords.z <= 2,
        `Invalid z coordinate: ${coords.z}`
    );

});

Then('the response should be in JSON format', async function () {
    assert.ok(this.botJson, 'Response is not valid JSON');

    const contentType = this.botResponse.headers()['content-type'];
    assert.ok(
        contentType && contentType.includes('application/json'),
        `Expected JSON content-type, got: ${contentType}`
    );

});

Then('it should be proxied through Nginx', async function () {
    assert.strictEqual(this.botStatus, 200, 'Proxy did not work correctly');
});



