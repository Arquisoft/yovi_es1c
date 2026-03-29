export const options = {
    stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        http_req_failed: ['rate<0.05'],
        checks: ['rate>0.95'],

        'http_req_duration{operation:register}': ['p(95)<1500'],
        'http_req_duration{operation:login}': ['p(95)<1200'],
        'http_req_duration{operation:refresh}': ['p(95)<1200'],

        loadtest_auth_register_success_rate: ['rate>0.95'],
        loadtest_auth_login_success_rate: ['rate>0.95'],
        loadtest_auth_refresh_success_rate: ['rate>0.95'],
        loadtest_auth_flow_success_rate: ['rate>0.95'],

        loadtest_auth_register_duration_ms: ['p(95)<1500'],
        loadtest_auth_login_duration_ms: ['p(95)<1200'],
        loadtest_auth_refresh_duration_ms: ['p(95)<1200'],
    },
};

export const BASE_URL = __ENV.TARGET_URL || 'http://localhost';

export const TEST_USER = {
    username: __ENV.LOADTEST_USERNAME || 'loadtest_user',
    password: __ENV.LOADTEST_PASSWORD || 'loadtest_pass_123',
};