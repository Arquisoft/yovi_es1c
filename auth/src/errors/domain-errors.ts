import { HttpError } from './http-error.js';

export class InvalidInputError extends HttpError {
    constructor(details: Array<{ field: string; message: string }>) {
        super(400, 'invalid_input', 'Invalid input', details);
    }
}

export class UserAlreadyExistsError extends HttpError {
    constructor() {
        super(409, 'user_already_exists', 'User already exists');
    }
}

export class BadCredentialsError extends HttpError {
    constructor() {
        super(401, 'bad_credentials', 'Invalid credentials');
    }
}

export class InvalidRefreshTokenError extends HttpError {
    constructor() {
        super(401, 'invalid_refresh_token', 'Invalid or expired refresh token');
    }
}

export class UnexpectedError extends HttpError {
    constructor() {
        super(500, 'unexpected_error', 'Unexpected server error');
    }
}
