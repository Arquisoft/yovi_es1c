import { authVerifyCacheEvents, authVerifyDuration } from '../metrics';

type Claims = {
  sub: string;
  username?: string;
  exp?: number;
};

type VerifyResponse = {
  valid: boolean;
  claims?: Claims;
};

type CacheEntry = {
  claims: Claims;
  expiresAt: number;
};

export class AuthVerifyError extends Error {
  constructor(public readonly code: 'AUTH_TIMEOUT' | 'AUTH_UNAVAILABLE' | 'AUTH_MISCONFIGURED') {
    super(code);
  }
}

export class AuthVerifyClient {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
      private readonly authServiceUrl: string,
      private readonly ttlMs = Number(process.env.AUTH_VERIFY_CACHE_TTL_MS ?? 10_000),
      private readonly requestTimeoutMs = Number(process.env.AUTH_VERIFY_TIMEOUT_MS ?? 1_500),
  ) {}

  async verifyAuthorizationHeader(authHeader: string): Promise<Claims | null> {
    const token = this.extractBearer(authHeader);
    if (!token) return null;
    return this.verifyToken(token, authHeader);
  }

  async verifyToken(token: string, authHeader = `Bearer ${token}`): Promise<Claims | null> {
    const cached = this.getCached(token);
    if (cached) {
      authVerifyCacheEvents.inc({ event: 'hit' });
      return cached;
    }

    authVerifyCacheEvents.inc({ event: 'miss' });
    const stop = authVerifyDuration.startTimer();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.authServiceUrl}/api/auth/verify`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (response.status >= 500) {
        stop({ result: 'error' });
        throw new AuthVerifyError('AUTH_UNAVAILABLE');
      }

      if (!response.ok) {
        stop({ result: 'invalid' });
        return null;
      }

      const data = (await response.json()) as VerifyResponse;
      if (!data.valid || !data.claims?.sub) {
        stop({ result: 'invalid' });
        return null;
      }

      this.store(token, data.claims);
      stop({ result: 'success' });
      return data.claims;
    } catch (error) {
      if (error instanceof AuthVerifyError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        stop({ result: 'error' });
        throw new AuthVerifyError('AUTH_TIMEOUT');
      }
      stop({ result: 'error' });
      throw new AuthVerifyError('AUTH_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
      this.cleanup();
    }
  }

  private extractBearer(authHeader: string): string | null {
    const match = authHeader.match(/^Bearer (\S+)$/i);
    return match?.[1] ?? null;
  }

  private getCached(token: string): Claims | null {
    const entry = this.cache.get(token);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(token);
      return null;
    }
    return entry.claims;
  }

  private store(token: string, claims: Claims): void {
    const expMs = typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + this.ttlMs;
    const expiresAt = Math.min(expMs, Date.now() + this.ttlMs);
    this.cache.set(token, { claims, expiresAt });
  }

  private cleanup(): void {
    if (this.cache.size <= 500) return;
    const now = Date.now();
    for (const [token, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(token);
      }
    }
  }
}
