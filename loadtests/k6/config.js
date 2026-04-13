export const BASE_URL = __ENV.TARGET_URL || 'http://localhost';

const parseBool = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    return String(value).toLowerCase() === 'true';
};

const shouldSkipTlsVerification = parseBool(
    __ENV.K6_INSECURE_TLS,
    BASE_URL.startsWith('https://'),
);

export const TEST_USER = {
    username: __ENV.LOADTEST_USERNAME || 'loadtest_user',
    password: __ENV.LOADTEST_PASSWORD || 'loadtest_pass_123',
};

const baseOptions = {
    insecureSkipTLSVerify: shouldSkipTlsVerification,
    stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        http_req_failed: ['rate<0.05'],
        checks: ['rate>0.95'],
    },
};

export const authOptions = {
    ...baseOptions,
    thresholds: {
        ...baseOptions.thresholds,
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

export const gameOptions = {
    ...baseOptions,
    thresholds: {
        ...baseOptions.thresholds,
        'http_req_duration{operation:create_bot_classic}': ['p(95)<800'],
        'http_req_duration{operation:create_bot_honey_pie}': ['p(95)<800'],
        'http_req_duration{operation:create_local_2p_pie}': ['p(95)<800'],
        'http_req_duration{operation:get_match}': ['p(95)<500'],
        'http_req_duration{operation:move}': ['p(95)<2000'],
        'http_req_duration{operation:finish}': ['p(95)<800'],
        'http_req_duration{operation:stats}': ['p(95)<800'],
    },
};

export const matchmakingOptions = {
    ...baseOptions,
    thresholds: {
        ...baseOptions.thresholds,
        'http_req_duration{operation:queue_join}': ['p(95)<800'],
        'http_req_duration{operation:queue_poll}': ['p(95)<800'],
        'http_req_duration{operation:queue_cancel}': ['p(95)<800'],
    },
};