export type BotDifficulty = 'easy' | 'medium' | 'hard';

const prefixes = ['Phosphor', 'Pixel', 'Neon', 'Arcade', 'Quantum'];
const suffixes = ['Knight', 'Warden', 'Rider', 'Nomad', 'Sage'];

export class BotFallbackService {
  chooseDifficulty(winRate: number, random = Math.random): BotDifficulty {
    const roll = random();

    if (winRate <= 40) {
      if (roll < 0.6) return 'easy';
      if (roll < 0.9) return 'medium';
      return 'hard';
    }

    if (winRate <= 60) {
      if (roll < 0.25) return 'easy';
      if (roll < 0.75) return 'medium';
      return 'hard';
    }

    if (roll < 0.1) return 'easy';
    if (roll < 0.45) return 'medium';
    return 'hard';
  }

  buildBotAlias(seed: string): string {
    const hash = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `${prefixes[hash % prefixes.length]}${suffixes[Math.floor(hash / prefixes.length) % suffixes.length]}`;
  }
}
