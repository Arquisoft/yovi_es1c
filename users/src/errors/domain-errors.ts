import { HttpError } from './http-error.js';

export class ProfileNotFoundError extends HttpError {
    constructor() {
        super(404, 'profile_not_found', 'Profile not found');
    }
}

export class UsernameTakenError extends HttpError {
    constructor() {
        super(409, 'username_taken', 'Username is already taken');
    }
}

export class ValidationError extends HttpError {
    constructor(message: string) {
        super(400, 'validation_error', message);
    }
}

export class UnexpectedError extends HttpError {
    constructor() {
        super(500, 'unexpected_error', 'Unexpected server error');
    }
}
