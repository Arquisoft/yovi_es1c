import http from 'k6/http';
import { check, sleep } from 'k6';
import { options, BASE_URL, TEST_USER } from './config.js';

export { options };

export default function () {
    const headers = { 'Content-Type': 'application/json' };
    const vuUsername = `loadtest_vu_${__VU}`;
    const vuPassword = TEST_USER.password;

    http.post(
        `${BASE_URL}/api/auth/register`,
        JSON.stringify({ username: vuUsername, password: vuPassword }),
        { headers }
    );

    const loginRes = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username: vuUsername, password: vuPassword }),
        { headers }
    );

    check(loginRes, {
        'login status 200': (r) => r.status === 200,
        'login returns token': (r) => r.json('accessToken') !== undefined,
    });

    if (loginRes.status !== 200) return;


    const refreshToken = loginRes.json('refreshToken');
    const refreshRes = http.post(
        `${BASE_URL}/api/auth/refresh`,
        JSON.stringify({ refreshToken }),
        { headers }
    );

    console.log(`VU ${__VU} ITER ${__ITER} — REFRESH status: ${refreshRes.status}`);

    check(refreshRes, {
        'refresh status 200': (r) => r.status === 200,
        'refresh returns token': (r) => r.json('accessToken') !== undefined,
    });

    sleep(1);
}