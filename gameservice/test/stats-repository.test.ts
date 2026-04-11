import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { StatsRepository } from '../src/repositories/StatsRepository';

describe('StatsRepository.getMatchHistory', () => {
  let pool: Pool;
  let repo: StatsRepository;

  beforeEach(() => {
    pool = {
      query: vi.fn(),
    } as unknown as Pool;

    repo = new StatsRepository(pool);
  });

  it('returns finished matches for a user ordered from newest to oldest', async () => {
    const rows = [
      { id: 1, board_size: 11, difficulty: 'easy', status: 'FINISHED', winner: 'USER', mode: 'BOT', created_at: '2026-01-03T10:00:00' },
      { id: 2, board_size: 11, difficulty: 'easy', status: 'FINISHED', winner: 'USER', mode: 'BOT', created_at: '2026-01-02T10:00:00' },
      { id: 3, board_size: 11, difficulty: 'easy', status: 'FINISHED', winner: 'USER', mode: 'BOT', created_at: '2026-01-01T10:00:00' },
    ];

    vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);

    const result = await repo.getMatchHistory(1, 10);

    expect(result).toHaveLength(3);
    expect(result[0].created_at).toBe('2026-01-03T10:00:00');
    expect(result[1].created_at).toBe('2026-01-02T10:00:00');
    expect(result[2].created_at).toBe('2026-01-01T10:00:00');
  });

  it('returns at most `limit` matches', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      board_size: 11,
      difficulty: 'easy',
      status: 'FINISHED',
      winner: 'USER',
      mode: 'BOT',
      created_at: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00`,
    }));

    vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never);

    const result = await repo.getMatchHistory(1, 10);

    expect(result).toHaveLength(10);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2'), [1, 10]);
  });

  it('returns an empty array when the user has no finished matches', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

    const result = await repo.getMatchHistory(999, 10);

    expect(result).toEqual([]);
  });

  it('does not include ONGOING matches', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { id: 1, board_size: 11, difficulty: 'easy', status: 'FINISHED', winner: 'USER', mode: 'BOT', created_at: '2026-01-01T10:00:00' },
      ],
    } as never);

    const result = await repo.getMatchHistory(1, 10);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('FINISHED');
  });

  it('does not include matches from other users', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, board_size: 11, difficulty: 'easy', status: 'FINISHED', winner: 'USER', mode: 'BOT', created_at: '2026-01-01T10:00:00' }],
    } as never);

    const result = await repo.getMatchHistory(1, 10);

    expect(result).toHaveLength(1);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = $1'), [1, 10]);
  });

  it('returns all expected fields on each row', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, board_size: 11, difficulty: 'easy', status: 'FINISHED', winner: 'BOT', mode: 'LOCAL_2P', created_at: '2026-01-01T10:00:00' }],
    } as never);

    const [row] = await repo.getMatchHistory(1, 10);

    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('board_size');
    expect(row).toHaveProperty('difficulty');
    expect(row).toHaveProperty('status', 'FINISHED');
    expect(row).toHaveProperty('winner', 'BOT');
    expect(row).toHaveProperty('mode', 'LOCAL_2P');
    expect(row).toHaveProperty('created_at');
  });
});