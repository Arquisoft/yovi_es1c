import { InvalidInputError } from '../errors/domain-errors.js';

type AuthBody = { username: string; password: string };
type RefreshBody = { refreshToken?: string };

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

    return { username: username.trim(), password };
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
