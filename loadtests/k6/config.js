const TARGET_ENV = (__ENV.TARGET_ENV || 'local').toLowerCase();
const IS_REMOTE = TARGET_ENV === 'remote';

const LOCAL_BASE_URL = __ENV.TARGET_URL || 'http://localhost';
const REMOTE_BASE_URL = __ENV.TARGET_URL_REMOTE || 'https://yovi-es1c.duckdns.org';

export const BASE_URL = IS_REMOTE ? REMOTE_BASE_URL : LOCAL_BASE_URL;

const parseBool = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    return String(value).toLowerCase() === 'true';
};

const shouldSkipTlsVerification = parseBool(
    __ENV.K6_INSECURE_TLS,
    !IS_REMOTE && BASE_URL.startsWith('https://'),
);

export const TEST_USER = {
    username: __ENV.LOADTEST_USERNAME || 'loadtest_user',
    password: __ENV.LOADTEST_PASSWORD || 'loadtest_pass_123',
};

const baseThresholdsByEnv = {
    local: {
        http_req_failed: ['rate<0.05'],
        checks: ['rate>0.95'],
    },
    remote: {
        http_req_failed: ['rate<0.08'],
        checks: ['rate>0.90'],
    },
};

const authThresholdsByEnv = {
    local: {
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
    remote: {
        'http_req_duration{operation:register}': ['p(95)<3000'],
        'http_req_duration{operation:login}': ['p(95)<2500'],
        'http_req_duration{operation:refresh}': ['p(95)<2500'],
        loadtest_auth_register_success_rate: ['rate>0.90'],
        loadtest_auth_login_success_rate: ['rate>0.90'],
        loadtest_auth_refresh_success_rate: ['rate>0.90'],
        loadtest_auth_flow_success_rate: ['rate>0.90'],
        loadtest_auth_register_duration_ms: ['p(95)<3000'],
        loadtest_auth_login_duration_ms: ['p(95)<2500'],
        loadtest_auth_refresh_duration_ms: ['p(95)<2500'],
    },
};

const gameThresholdsByEnv = {
    local: {
        'http_req_duration{operation:create_bot_classic}': ['p(95)<800'],
        'http_req_duration{operation:create_bot_honey_pie}': ['p(95)<800'],
        'http_req_duration{operation:create_local_2p_pie}': ['p(95)<800'],
        'http_req_duration{operation:get_match}': ['p(95)<500'],
        'http_req_duration{operation:move}': ['p(95)<2000'],
        'http_req_duration{operation:finish}': ['p(95)<800'],
        'http_req_duration{operation:stats}': ['p(95)<800'],
    },
    remote: {
        'http_req_duration{operation:create_bot_classic}': ['p(95)<1800'],
        'http_req_duration{operation:create_bot_honey_pie}': ['p(95)<1800'],
        'http_req_duration{operation:create_local_2p_pie}': ['p(95)<1800'],
        'http_req_duration{operation:get_match}': ['p(95)<1200'],
        'http_req_duration{operation:move}': ['p(95)<3500'],
        'http_req_duration{operation:finish}': ['p(95)<1800'],
        'http_req_duration{operation:stats}': ['p(95)<1800'],
    },
};

const matchmakingThresholdsByEnv = {
    local: {
        'http_req_duration{operation:queue_join}': ['p(95)<800'],
        'http_req_duration{operation:queue_poll}': ['p(95)<800'],
        'http_req_duration{operation:queue_cancel}': ['p(95)<800'],
    },
    remote: {
        'http_req_duration{operation:queue_join}': ['p(95)<1800'],
        'http_req_duration{operation:queue_poll}': ['p(95)<1800'],
        'http_req_duration{operation:queue_cancel}': ['p(95)<1800'],
    },
};

const selectedBaseThresholds = IS_REMOTE
    ? baseThresholdsByEnv.remote
    : baseThresholdsByEnv.local;

const selectedAuthThresholds = IS_REMOTE
    ? authThresholdsByEnv.remote
    : authThresholdsByEnv.local;

const selectedGameThresholds = IS_REMOTE
    ? gameThresholdsByEnv.remote
    : gameThresholdsByEnv.local;

const selectedMatchmakingThresholds = IS_REMOTE
    ? matchmakingThresholdsByEnv.remote
    : matchmakingThresholdsByEnv.local;

const baseOptions = {
    insecureSkipTLSVerify: shouldSkipTlsVerification,
    stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0 },
    ],
    thresholds: selectedBaseThresholds,
};

export const authOptions = {
    ...baseOptions,
    thresholds: {
        ...baseOptions.thresholds,
        ...selectedAuthThresholds,
    },
};

export const gameOptions = {
    ...baseOptions,
    thresholds: {
        ...baseOptions.thresholds,
        ...selectedGameThresholds,
    },
};

export const matchmakingOptions = {
    ...baseOptions,
    thresholds: {
        ...baseOptions.thresholds,
        ...selectedMatchmakingThresholds,
    },
};