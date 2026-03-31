import { describe, expect, it } from 'vitest';
import { BotFallbackService } from '../src/services/BotFallbackService';

describe('BotFallbackService', () => {
  it('matches difficulty weights for low/mid/high win rates', () => {
    const service = new BotFallbackService();

    expect(service.chooseDifficulty(35, () => 0.2)).toBe('easy');
    expect(service.chooseDifficulty(35, () => 0.7)).toBe('medium');
    expect(service.chooseDifficulty(35, () => 0.95)).toBe('hard');

    expect(service.chooseDifficulty(50, () => 0.2)).toBe('easy');
    expect(service.chooseDifficulty(50, () => 0.5)).toBe('medium');
    expect(service.chooseDifficulty(50, () => 0.9)).toBe('hard');

    expect(service.chooseDifficulty(80, () => 0.05)).toBe('easy');
    expect(service.chooseDifficulty(80, () => 0.2)).toBe('medium');
    expect(service.chooseDifficulty(80, () => 0.95)).toBe('hard');
  });

  it('builds reproducible alias', () => {
    const service = new BotFallbackService();
    expect(service.buildBotAlias('match-1')).toBe(service.buildBotAlias('match-1'));
  });
});
