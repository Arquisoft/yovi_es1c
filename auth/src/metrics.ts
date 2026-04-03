import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export type AuthRoute =
    | '/api/auth/register'
    | '/api/auth/login'
    | '/api/auth/refresh'
    | '/api/auth/logout'
    | '/api/auth/logout-all'
    | '/api/auth/verify';

export type DbOperation =
    | 'create_user'
    | 'find_user_by_username'
    | 'find_user_by_id'
    | 'store_refresh_token'
    | 'find_refresh_token_by_hash'
    | 'revoke_refresh_token'
    | 'revoke_refresh_token_family'
    | 'revoke_all_user_sessions'
    | 'count_active_refresh_tokens';

type DbResult = 'success' | 'error';

type RegisterResult = 'success' | 'user_exists' | 'invalid_input' | 'unexpected_error';
type LoginResult = 'success' | 'bad_credentials' | 'invalid_input' | 'unexpected_error';
type RefreshResult =
    | 'success'
    | 'missing_token'
    | 'invalid_input'
    | 'token_not_found'
    | 'revoked_token'
    | 'expired_token'
    | 'unexpected_error';
type VerifyResult =
    | 'success'
    | 'missing_token'
    | 'missing_secret'
    | 'invalid_token'
    | 'wrong_token_type';
type RefreshRevocationReason =
    | 'login_revoke_all'
    | 'refresh_rotation'
    | 'refresh_expired'
    | 'refresh_token_reuse';

const httpDurationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
const cryptoDurationBuckets = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2];
const dbDurationBuckets = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1];

export const authHttpRequestsTotal = new Counter({
    name: 'auth_http_requests_total',
    help: 'Total HTTP requests processed by the auth service',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [metricsRegistry],
});

export const authHttpRequestDurationSeconds = new Histogram({
    name: 'auth_http_request_duration_seconds',
    help: 'HTTP request latency for the auth service',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: httpDurationBuckets,
    registers: [metricsRegistry],
});

export const authRegisterAttemptsTotal = new Counter({
    name: 'auth_register_attempts_total',
    help: 'Register attempts by result',
    labelNames: ['result'] as const,
    registers: [metricsRegistry],
});

export const authLoginAttemptsTotal = new Counter({
    name: 'auth_login_attempts_total',
    help: 'Login attempts by result',
    labelNames: ['result'] as const,
    registers: [metricsRegistry],
});

export const loginAttempts = new Counter({
    name: 'auth_login_attempts_simple_total',
    help: 'Login attempts grouped by success or failure',
    labelNames: ['result'] as const,
    registers: [metricsRegistry],
});

export const tokensIssued = new Counter({
    name: 'auth_tokens_issued_total',
    help: 'Total tokens issued by the auth service',
    registers: [metricsRegistry],
});

export const tokenVerifications = new Counter({
    name: 'auth_token_verifications_total',
    help: 'Token verification attempts grouped by validity',
    labelNames: ['result'] as const,
    registers: [metricsRegistry],
});

export const authRefreshAttemptsTotal = new Counter({
    name: 'auth_refresh_attempts_total',
    help: 'Refresh attempts by result',
    labelNames: ['result'] as const,
    registers: [metricsRegistry],
});

export const authVerifyAttemptsTotal = new Counter({
    name: 'auth_verify_attempts_total',
    help: 'Verify attempts by result',
    labelNames: ['result'] as const,
    registers: [metricsRegistry],
});

export const authErrorsTotal = new Counter({
    name: 'auth_errors_total',
    help: 'Errors emitted by the auth service error handler',
    labelNames: ['type'] as const,
    registers: [metricsRegistry],
});

export const authBcryptHashDurationSeconds = new Histogram({
    name: 'auth_bcrypt_hash_duration_seconds',
    help: 'Duration of bcrypt.hash operations',
    buckets: cryptoDurationBuckets,
    registers: [metricsRegistry],
});

export const authBcryptCompareDurationSeconds = new Histogram({
    name: 'auth_bcrypt_compare_duration_seconds',
    help: 'Duration of bcrypt.compare operations',
    buckets: cryptoDurationBuckets,
    registers: [metricsRegistry],
});

export const authJwtSignDurationSeconds = new Histogram({
    name: 'auth_jwt_sign_duration_seconds',
    help: 'Duration of JWT signing operations',
    buckets: cryptoDurationBuckets,
    registers: [metricsRegistry],
});

export const authJwtVerifyDurationSeconds = new Histogram({
    name: 'auth_jwt_verify_duration_seconds',
    help: 'Duration of JWT verification operations',
    buckets: cryptoDurationBuckets,
    registers: [metricsRegistry],
});

export const authDbOperationDurationSeconds = new Histogram({
    name: 'auth_db_operation_duration_seconds',
    help: 'SQLite operation latency in the auth service',
    labelNames: ['operation', 'result'] as const,
    buckets: dbDurationBuckets,
    registers: [metricsRegistry],
});

export const authRefreshTokensIssuedTotal = new Counter({
    name: 'auth_refresh_tokens_issued_total',
    help: 'Refresh tokens issued by the auth service',
    registers: [metricsRegistry],
});

export const authRefreshTokensRevokedTotal = new Counter({
    name: 'auth_refresh_tokens_revoked_total',
    help: 'Refresh tokens revoked by the auth service',
    labelNames: ['reason'] as const,
    registers: [metricsRegistry],
});

export const authActiveRefreshTokens = new Gauge({
    name: 'auth_active_refresh_tokens',
    help: 'Currently active non-revoked refresh tokens',
    registers: [metricsRegistry],
});

export function startAuthHttpRequestTimer(method: string, route: AuthRoute) {
    const endTimer = authHttpRequestDurationSeconds.startTimer({ method, route });

    return (statusCode: number) => {
        const status = String(statusCode);
        endTimer({ status });
        authHttpRequestsTotal.inc({ method, route, status });
    };
}

export function recordRegisterAttempt(result: RegisterResult) {
    authRegisterAttemptsTotal.inc({ result });
}

export function recordLoginAttempt(result: LoginResult) {
    authLoginAttemptsTotal.inc({ result });
}

export function recordSimpleLoginAttempt(result: 'success' | 'failure') {
    loginAttempts.inc({ result });
}

export function recordRefreshAttempt(result: RefreshResult) {
    authRefreshAttemptsTotal.inc({ result });
}

export function recordVerifyAttempt(result: VerifyResult) {
    authVerifyAttemptsTotal.inc({ result });
}

export function recordTokenVerification(result: 'valid' | 'invalid' | 'expired') {
    tokenVerifications.inc({ result });
}

export function recordAuthError(type: string) {
    authErrorsTotal.inc({ type });
}

export function startBcryptHashTimer() {
    return authBcryptHashDurationSeconds.startTimer();
}

export function startBcryptCompareTimer() {
    return authBcryptCompareDurationSeconds.startTimer();
}

export function startJwtSignTimer() {
    return authJwtSignDurationSeconds.startTimer();
}

export function startJwtVerifyTimer() {
    return authJwtVerifyDurationSeconds.startTimer();
}

export function startDbOperationTimer(operation: DbOperation) {
    const endTimer = authDbOperationDurationSeconds.startTimer({ operation });

    return (result: DbResult) => {
        endTimer({ result });
    };
}

export function recordRefreshTokenIssued(count = 1) {
    authRefreshTokensIssuedTotal.inc(count);
    tokensIssued.inc(count);
}

export function recordTokensIssued(count = 1) {
    tokensIssued.inc(count);
}

export function recordRefreshTokenRevocation(reason: RefreshRevocationReason, count = 1) {
    if (count > 0) {
        authRefreshTokensRevokedTotal.inc({ reason }, count);
    }
}

export function setActiveRefreshTokens(value: number) {
    authActiveRefreshTokens.set(value);
}

export function incrementActiveRefreshTokens(count = 1) {
    if (count > 0) {
        authActiveRefreshTokens.inc(count);
    }
}

export function decrementActiveRefreshTokens(count = 1) {
    if (count > 0) {
        authActiveRefreshTokens.dec(count);
    }
}
