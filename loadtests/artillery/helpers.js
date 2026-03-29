const https = require('https');
const http = require('http');

// Called before each virtual user scenario to inject a fresh JWT
async function getAuthToken(context, events, done) {
    const baseUrl  = process.env.TARGET_URL      || 'http://localhost';
    const username = process.env.LOADTEST_USERNAME || 'loadtest_user';
    const password = process.env.LOADTEST_PASSWORD || 'loadtest_pass_123';

    const body = JSON.stringify({ username, password });
    const url  = new URL(`${baseUrl}/api/auth/login`);

    const lib = url.protocol === 'https:' ? https : http;

    const token = await new Promise((resolve, reject) => {
        const req = lib.request(
            {
                hostname: url.hostname,
                port:     url.port || (url.protocol === 'https:' ? 443 : 80),
                path:     url.pathname,
                method:   'POST',
                headers: {
                    'Content-Type':   'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data).accessToken || null);
                    } catch {
                        resolve(null);
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });

    context.vars.token = token;
    return done();
}

module.exports = { getAuthToken };