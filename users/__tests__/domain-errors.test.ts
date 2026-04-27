import { describe, expect, it } from 'vitest';
import {
  ForbiddenFriendRequestActionError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError,
  FriendshipNotFoundError,
  NotFriendsError,
  ProfileNotFoundError,
  UnexpectedError,
  UsernameTakenError,
  ValidationError,
} from '../src/errors/domain-errors.js';
import { HttpError } from '../src/errors/http-error.js';

describe('domain errors', () => {
  it.each([
    [new ProfileNotFoundError(), 404, 'profile_not_found', 'Profile not found'],
    [new UsernameTakenError(), 409, 'username_taken', 'Username is already taken'],
    [new ValidationError('Invalid input'), 400, 'validation_error', 'Invalid input'],
    [new FriendRequestAlreadyExistsError(), 409, 'friend_request_exists', 'There is already a pending friend request between these users'],
    [new FriendshipAlreadyExistsError(), 409, 'friendship_exists', 'These users are already friends'],
    [new FriendshipNotFoundError(), 404, 'friendship_not_found', 'Friendship not found'],
    [new FriendRequestNotFoundError(), 404, 'friend_request_not_found', 'Friend request not found'],
    [new ForbiddenFriendRequestActionError(), 403, 'forbidden_friend_request_action', 'You are not allowed to modify this friend request'],
    [new NotFriendsError(), 403, 'not_friends', 'You can only chat with friends'],
    [new UnexpectedError(), 500, 'unexpected_error', 'Unexpected server error'],
  ])('keeps HTTP metadata on %s', (error, statusCode, errorCode, message) => {
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(statusCode);
    expect(error.error).toBe(errorCode);
    expect(error.message).toBe(message);
  });
});
