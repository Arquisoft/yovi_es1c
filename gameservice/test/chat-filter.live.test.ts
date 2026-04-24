import { describe, expect, it } from 'vitest';
import { ChatFilter, ChatFilterError } from '../src/services/ChatFilter';

const liveIt = process.env.RUN_PERSPECTIVE_LIVE_TESTS === '1' ? it : it.skip;

describe('ChatFilter live Perspective smoke tests', () => {
  liveIt('returns numeric scores and ranks hostile content above benign content', async () => {
    expect(process.env.PERSPECTIVE_API_KEY).toBeTruthy();

    const filter = new ChatFilter({
      perspectiveFailureMode: 'reject',
      perspectiveTimeoutMs: 5000,
      toxicityThreshold: 0.99,
    });

    const benign = await filter.filter('Hello, good luck and have fun in this match.');
    const hostile = await filter.filter('You are worthless trash and I hate you.');

    expect(typeof benign.toxicityScore).toBe('number');
    expect(typeof hostile.toxicityScore).toBe('number');
    expect(benign.toxicityScore!).toBeGreaterThanOrEqual(0);
    expect(hostile.toxicityScore!).toBeLessThanOrEqual(1);
    expect(hostile.toxicityScore!).toBeGreaterThan(benign.toxicityScore!);
  });

  liveIt('rejects clearly toxic content with the real Perspective API', async () => {
    expect(process.env.PERSPECTIVE_API_KEY).toBeTruthy();

    const filter = new ChatFilter({
      perspectiveFailureMode: 'reject',
      perspectiveTimeoutMs: 5000,
      toxicityThreshold: 0.8,
    });

    await expect(filter.filter('You are worthless trash and I hate you.')).rejects.toMatchObject({
      kind: 'toxicity',
    } satisfies Partial<ChatFilterError>);
  });
});
