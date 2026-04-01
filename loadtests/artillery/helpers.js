const https = require('https');
const http = require('http');
const tokenCache = {};

async function getAuthToken(context, events, done) {
    const uid = context._uid;
    const baseUrl = process.env.TARGET_URL || 'http://localhost';
    const password = process.env.LOADTEST_PASSWORD || 'loadtest_pass_123';

    if (tokenCache[uid]) {
        context.vars.token = tokenCache[uid];
        return done();
    }

    const username = `artillery_vu_${uid || Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const url = new URL(`${baseUrl}/api/auth`);
    const lib = url.protocol === 'https:' ? https : http;
    const baseOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        headers: { 'Content-Type': 'application/json' },
    };

    // 1. Registrar
    const registerBody = JSON.stringify({ username, password });
    await new Promise((resolve) => {
        const req = lib.request(
            {
                ...baseOptions,
                path: `${url.pathname}/register`,
                method: 'POST',
                headers: { ...baseOptions.headers, 'Content-Length': Buffer.byteLength(registerBody) },
            },
            (res) => { res.resume(); res.on('end', resolve); }
        );
        req.on('error', resolve);
        req.write(registerBody);
        req.end();
    });

    // 2. Login
    const loginBody = JSON.stringify({ username, password });
    const loginPath = new URL(`${baseUrl}/api/auth/login`);

    const token = await new Promise((resolve, reject) => {
        const req = lib.request(
            {
                ...baseOptions,
                hostname: loginPath.hostname,
                port: loginPath.port || (loginPath.protocol === 'https:' ? 443 : 80),
                path: loginPath.pathname,
                method: 'POST',
                headers: { ...baseOptions.headers, 'Content-Length': Buffer.byteLength(loginBody) },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try { resolve(JSON.parse(data).accessToken || null); }
                    catch { resolve(null); }
                });
            }
        );
        req.on('error', reject);
        req.write(loginBody);
        req.end();
    });

    if (!token) {
        events.emit('error', 'getAuthToken: login failed, no token received');
        return done(new Error('Missing token'));
    }

    tokenCache[uid] = token;
    context.vars.token = token;
    return done();
}

module.exports = { getAuthToken };