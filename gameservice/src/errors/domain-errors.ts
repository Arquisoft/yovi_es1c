import { HttpError } from './http-error.js';

export class MatchNotFoundError extends HttpError {
    constructor() {
        super(404, 'match_not_found', 'Match not found');
    }
}

export class UnauthorizedMatchError extends HttpError {
    constructor() {
        super(403, 'unauthorized_match', 'You do not have permission to access this match');
    }
}

export class InvalidMoveError extends HttpError {
    constructor(message: string) {
        super(400, 'invalid_move', message);
    }
}

export class UnexpectedError extends HttpError {
    constructor() {
        super(500, 'unexpected_error', 'Unexpected server error');
    }
}
