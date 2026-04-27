import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyProfile, updateMyProfile, type Profile } from '../features/profile/api/profileApi'
import { fetchWithAuth } from '../shared/api/fetchWithAuth'

vi.mock('../shared/api/fetchWithAuth', () => ({
  fetchWithAuth: vi.fn(),
}))

const fetchWithAuthMock = vi.mocked(fetchWithAuth)

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('profileApi additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes alternate backend field names and safe defaults', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({
      id: 9,
      username: undefined,
      displayName: 'Visible name',
      email: undefined,
      avatar: undefined,
    }))

    await expect(getMyProfile()).resolves.toEqual({
      id: 9,
      username: '',
      displayName: 'Visible name',
      email: '',
      avatar: '/avatars/avatar01.png',
    })
  })

  it('falls back to username as displayName when display names are missing', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({
      user_id: 3,
      username: 'cai',
      email: 'cai@yovi.test',
    }))

    await expect(getMyProfile()).resolves.toEqual({
      id: 3,
      username: 'cai',
      displayName: 'cai',
      email: 'cai@yovi.test',
      avatar: '/avatars/avatar01.png',
    })
  })

  it('throws and logs when updating profile fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const profile: Profile = {
      id: 7,
      username: 'bea',
      displayName: 'Bea',
      email: 'bea@yovi.test',
      avatar: null,
    }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({ message: 'bad request' }, { status: 400 }))

    await expect(updateMyProfile(profile)).rejects.toThrow('Profile update endpoint not available')

    consoleSpy.mockRestore()
  })

  it('preserves local profile values when update response omits optional fields', async () => {
    const profile: Profile = {
      id: 7,
      username: 'bea',
      displayName: 'Bea',
      email: 'bea@yovi.test',
      avatar: null,
    }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({}))

    await expect(updateMyProfile(profile)).resolves.toEqual({
      id: 7,
      username: 'bea',
      displayName: 'Bea',
      email: 'bea@yovi.test',
      avatar: '/avatars/avatar01.png',
    })
  })
})
