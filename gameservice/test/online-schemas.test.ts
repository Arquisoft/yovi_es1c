import { describe, expect, it } from 'vitest';
import { validateCreateFriendInvite, validateFriendInviteId, validateQueueJoin } from '../src/validation/online.schemas';

describe('online schemas', () => {
  it('normalizes friend invites with snake_case friend ids', () => {
    expect(validateCreateFriendInvite({ friend_user_id: '3', boardSize: 8 })).toEqual({
      friendUserId: 3,
      boardSize: 8,
      rules: {
        pieRule: { enabled: false },
        honey: { enabled: false, blockedCells: [] },
      },
    });
  });

  it('rejects invalid friend ids', () => {
    expect(() => validateCreateFriendInvite({ friendUserId: 0, boardSize: 8 })).toThrow('friendUserId must be a positive integer');
  });

  it('trims friend invite ids and rejects blank values', () => {
    expect(validateFriendInviteId([' friend-1 '])).toBe('friend-1');
    expect(() => validateFriendInviteId('  ')).toThrow('inviteId is required');
  });

  it('rejects malformed queue rules', () => {
    expect(() => validateQueueJoin({ boardSize: 8, rules: { pieRule: { enabled: 'yes' } } })).toThrow('rules.pieRule.enabled must be a boolean');
    expect(() => validateQueueJoin({ boardSize: 8, rules: { honey: { blockedCells: [{ row: 1, col: 1 }] } } })).toThrow('rules.honey.blockedCells is generated automatically and cannot be configured manually');
  });
});
