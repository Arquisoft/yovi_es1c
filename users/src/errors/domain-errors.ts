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

export class FriendRequestAlreadyExistsError extends HttpError {
    constructor() {
        super(409, 'friend_request_exists', 'There is already a pending friend request between these users');
    }
}

export class FriendshipAlreadyExistsError extends HttpError {
    constructor() {
        super(409, 'friendship_exists', 'These users are already friends');
    }
}

export class FriendshipNotFoundError extends HttpError {
    constructor() {
        super(404, 'friendship_not_found', 'Friendship not found');
    }
}

export class FriendRequestNotFoundError extends HttpError {
    constructor() {
        super(404, 'friend_request_not_found', 'Friend request not found');
    }
}

export class ForbiddenFriendRequestActionError extends HttpError {
    constructor() {
        super(403, 'forbidden_friend_request_action', 'You are not allowed to modify this friend request');
    }
}

export class NotFriendsError extends HttpError {
    constructor() {
        super(403, 'not_friends', 'You can only chat with friends');
    }
}

export class UnexpectedError extends HttpError {
    constructor() {
        super(500, 'unexpected_error', 'Unexpected server error');
    }
}
