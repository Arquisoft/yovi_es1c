const https = require('https');
const http = require('http');

const tokenCache = {};

function isInsecureTlsEnabled(rawValue = process.env.LOADTEST_INSECURE_TLS) {
    return String(rawValue).toLowerCase() === 'true';
}

function buildHttpRequestOptions(parsedUrl, path, contentLength, insecureTls = isInsecureTlsEnabled()) {
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': contentLength,
        },
    };

    if (parsedUrl.protocol === 'https:' && insecureTls) {
        options.rejectUnauthorized = false;
    }

    return options;
}

async function getAuthToken(context, events, done) {
    if (!context.vars.__uid) {
        context.vars.__uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    const uid = context.vars.__uid;

    const baseUrl = process.env.TARGET_URL || 'http://localhost';
    const password = process.env.LOADTEST_PASSWORD || 'loadtest_pass_123';

    if (tokenCache[uid]) {
        context.vars.token = tokenCache[uid];
        return done();
    }

    const username = `artillery_vu_${uid}`;

    function httpRequest(url, path, body) {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const bodyStr = JSON.stringify(body);
        return new Promise((resolve, reject) => {
            const req = lib.request(buildHttpRequestOptions(parsed, path, Buffer.byteLength(bodyStr)), (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve({}); }
                });
            });
            req.on('error', reject);
            req.write(bodyStr);
            req.end();
        });
    }

    try {
        // Register (ignorar errores si ya existe)
        await httpRequest(baseUrl, '/api/auth/register', { username, password }).catch(() => {});

        // Login
        const loginRes = await httpRequest(baseUrl, '/api/auth/login', { username, password });
        const token = loginRes?.accessToken || null;

        if (!token) {
            events.emit('error', `AUTH_FAILED: no token for ${username}`);
            context.vars.token = null;
            return done();
        }

        tokenCache[uid] = token;
        context.vars.token = token;
    } catch (err) {
        events.emit('error', `AUTH_ERROR: ${err.message}`);
        context.vars.token = null;
    }

    return done();
}

module.exports = {
    buildHttpRequestOptions,
    getAuthToken,
    isInsecureTlsEnabled,
};
