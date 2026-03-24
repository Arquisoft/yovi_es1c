import { OnlineSessionState } from '../types/online';

export class OnlineSessionRepository {
  private sessions = new Map<string, OnlineSessionState>();

  async save(session: OnlineSessionState): Promise<void> {
    this.sessions.set(session.matchId, session);
  }

  async get(matchId: string): Promise<OnlineSessionState | null> {
    return this.sessions.get(matchId) ?? null;
  }

  async delete(matchId: string): Promise<void> {
    this.sessions.delete(matchId);
  }

  async getAll(): Promise<OnlineSessionState[]> {
    return Array.from(this.sessions.values());
  }
}
