import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithAuth } from '../shared/api/fetchWithAuth'

describe('fetchWithAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('adds Authorization header when token exists in localStorage', async () => {
    localStorage.setItem('auth_token', 'test-token')
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response)
    globalThis.fetch = mockFetch

    await fetchWithAuth('/api/test')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Headers }]
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer test-token')
  })

  it('does not add Authorization header when no token', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response)
    globalThis.fetch = mockFetch

    await fetchWithAuth('/api/test')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Headers }]
    expect((init.headers as Headers).get('Authorization')).toBeNull()
  })

  it('passes through additional init options', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response)
    globalThis.fetch = mockFetch

    await fetchWithAuth('/api/test', { method: 'POST', body: 'data' })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/test')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('data')
  })
})
