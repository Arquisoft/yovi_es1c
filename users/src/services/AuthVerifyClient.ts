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
    constructor(public readonly code: 'AUTH_TIMEOUT' | 'AUTH_UNAVAILABLE') {
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
            return cached;
        }

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
                throw new AuthVerifyError('AUTH_UNAVAILABLE');
            }

            if (!response.ok) {
                return null;
            }

            const data = (await response.json()) as VerifyResponse;
            if (!data.valid || !data.claims?.sub) {
                return null;
            }

            this.store(token, data.claims);
            return data.claims;
        } catch (error) {
            if (error instanceof AuthVerifyError) {
                throw error;
            }
            if (error instanceof Error && error.name === 'AbortError') {
                throw new AuthVerifyError('AUTH_TIMEOUT');
            }
            throw new AuthVerifyError('AUTH_UNAVAILABLE');
        } finally {
            clearTimeout(timeout);
            this.cleanup();
        }
    }

    private extractBearer(authHeader: string): string | null {
        const trimmed = authHeader.trim();
        const separator = trimmed.indexOf(' ');
        if (separator <= 0) return null;

        const scheme = trimmed.slice(0, separator).toLowerCase();
        const token = trimmed.slice(separator + 1).trim();
        if (scheme !== 'bearer' || !token || token.includes(' ')) {
            return null;
        }

        return token;
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
