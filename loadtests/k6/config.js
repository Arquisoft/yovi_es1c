export const options = {
    stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        http_req_failed:   ['rate<0.05'],
        http_req_duration: ['p(95)<2000'],
    },
};

export const BASE_URL = __ENV.TARGET_URL || 'http://localhost';

export const TEST_USER  = {
    username: __ENV.LOADTEST_USERNAME || 'loadtest_user',
    password: __ENV.LOADTEST_PASSWORD || 'loadtest_pass_123',
};