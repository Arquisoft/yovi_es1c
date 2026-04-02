import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { authOptions, BASE_URL, TEST_USER } from './config.js';

export const options = authOptions;


const registerDuration = new Trend('loadtest_auth_register_duration_ms', true);
const loginDuration = new Trend('loadtest_auth_login_duration_ms', true);
const refreshDuration = new Trend('loadtest_auth_refresh_duration_ms', true);

const registerSuccessRate = new Rate('loadtest_auth_register_success_rate');
const loginSuccessRate = new Rate('loadtest_auth_login_success_rate');
const refreshSuccessRate = new Rate('loadtest_auth_refresh_success_rate');
const flowSuccessRate = new Rate('loadtest_auth_flow_success_rate');

const registerFailures = new Counter('loadtest_auth_register_failures_total');
const loginFailures = new Counter('loadtest_auth_login_failures_total');
const refreshFailures = new Counter('loadtest_auth_refresh_failures_total');

export default function () {
    const headers = { 'Content-Type': 'application/json' };
    const uniqueSuffix = `${__VU}_${__ITER}_${Date.now()}`;
    const username = `loadtest_vu_${uniqueSuffix}`;
    const password = TEST_USER.password;

    const registerRes = http.post(
        `${BASE_URL}/api/auth/register`,
        JSON.stringify({ username, password }),
        {
            headers,
            tags: {
                suite: 'auth',
                operation: 'register',
            },
        }
    );

    registerDuration.add(registerRes.timings.duration);

    const registerOk = check(registerRes, {
        'register status 201': (r) => r.status === 201,
        'register returns access token': (r) => r.json('accessToken') !== undefined,
        'register returns refresh token': (r) => r.json('refreshToken') !== undefined,
    });

    registerSuccessRate.add(registerOk);

    if (!registerOk) {
        registerFailures.add(1);
        flowSuccessRate.add(false);
        sleep(1);
        return;
    }

    const loginRes = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username, password }),
        {
            headers,
            tags: {
                suite: 'auth',
                operation: 'login',
            },
        }
    );

    loginDuration.add(loginRes.timings.duration);

    const loginOk = check(loginRes, {
        'login status 200': (r) => r.status === 200,
        'login returns access token': (r) => r.json('accessToken') !== undefined,
        'login returns refresh token': (r) => r.json('refreshToken') !== undefined,
    });

    loginSuccessRate.add(loginOk);

    if (!loginOk) {
        loginFailures.add(1);
        flowSuccessRate.add(false);
        sleep(1);
        return;
    }

    const refreshToken = loginRes.json('refreshToken');

    const refreshRes = http.post(
        `${BASE_URL}/api/auth/refresh`,
        JSON.stringify({ refreshToken }),
        {
            headers,
            tags: {
                suite: 'auth',
                operation: 'refresh',
            },
        }
    );

    refreshDuration.add(refreshRes.timings.duration);

    const refreshOk = check(refreshRes, {
        'refresh status 200': (r) => r.status === 200,
        'refresh returns access token': (r) => r.json('accessToken') !== undefined,
        'refresh returns refresh token': (r) => r.json('refreshToken') !== undefined,
    });

    refreshSuccessRate.add(refreshOk);

    if (!refreshOk) {
        refreshFailures.add(1);
    }

    flowSuccessRate.add(registerOk && loginOk && refreshOk);

    sleep(1);
}