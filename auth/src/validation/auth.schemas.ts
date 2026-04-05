import { InvalidInputError } from '../errors/domain-errors.js';

type AuthBody = { username: string; password: string; deviceId?: string; deviceName?: string };
type RefreshBody = { refreshToken?: string };
type LogoutBody = { sessionId?: string };

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new InvalidInputError([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }

    return value as Record<string, unknown>;
}

export function parseAuthBody(body: unknown): AuthBody {
    const data = asRecord(body);
    const details: Array<{ field: string; message: string }> = [];

    const usernameRaw = data.username;
    const passwordRaw = data.password;
    const deviceIdRaw = data.deviceId;
    const deviceNameRaw = data.deviceName;

    if (typeof usernameRaw !== 'string' || usernameRaw.trim().length === 0) {
        details.push({ field: 'username', message: 'username is required and must be a non-empty string' });
    }

    if (typeof passwordRaw !== 'string' || passwordRaw.trim().length === 0) {
        details.push({ field: 'password', message: 'password is required and must be a non-empty string' });
    } else if (passwordRaw.length < 8) {
        details.push({ field: 'password', message: 'password must be at least 8 characters long' });
    }

    if (details.length > 0) {
        throw new InvalidInputError(details);
    }

    const username = usernameRaw as string;
    const password = passwordRaw as string;

    const parsed: AuthBody = { username: username.trim(), password };

    if (typeof deviceIdRaw === 'string' && deviceIdRaw.trim().length > 0) {
        parsed.deviceId = deviceIdRaw.trim();
    }

    if (typeof deviceNameRaw === 'string' && deviceNameRaw.trim().length > 0) {
        parsed.deviceName = deviceNameRaw.trim();
    }

    return parsed;
}

export function parseRefreshBody(body: unknown): RefreshBody {
    const data = asRecord(body);
    const details: Array<{ field: string; message: string }> = [];
    const refreshTokenRaw = data.refreshToken;

    if (refreshTokenRaw !== undefined && (typeof refreshTokenRaw !== 'string' || refreshTokenRaw.trim().length === 0)) {
        details.push({ field: 'refreshToken', message: 'refreshToken must be a non-empty string when provided' });
    }

    if (details.length > 0) {
        throw new InvalidInputError(details);
    }

    if (typeof refreshTokenRaw === 'string') {
        return { refreshToken: refreshTokenRaw.trim() };
    }

    return {};
}

export function parseLogoutBody(body: unknown): LogoutBody {
    if (body === undefined || body === null) return {};
    const data = asRecord(body);
    const details: Array<{ field: string; message: string }> = [];
    const sessionIdRaw = data.sessionId;

    if (sessionIdRaw !== undefined && (typeof sessionIdRaw !== 'string' || sessionIdRaw.trim().length === 0)) {
        details.push({ field: 'sessionId', message: 'sessionId must be a non-empty string when provided' });
    }

    if (details.length > 0) {
        throw new InvalidInputError(details);
    }

    if (typeof sessionIdRaw === 'string') {
        return { sessionId: sessionIdRaw.trim() };
    }

    return {};
}
