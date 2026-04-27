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

describe('profileApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and normalizes my profile from the users service', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({
      user_id: 7,
      username: 'bea',
      display_name: 'Bea Player',
      email: 'bea@example.com',
      avatar: null,
    }))

    await expect(getMyProfile()).resolves.toEqual({
      id: 7,
      username: 'bea',
      displayName: 'Bea Player',
      email: 'bea@example.com',
      avatar: '/avatars/avatar01.png',
    })

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/users/me')
  })

  it('updates my profile with the safe editable fields only', async () => {
    const profile: Profile = {
      id: 7,
      username: 'bea',
      displayName: 'Bea Player',
      email: 'bea@example.com',
      avatar: '/avatars/avatar02.png',
    }

    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({
      user_id: 7,
      username: 'bea',
      displayName: 'Beatriz',
      email: 'bea@new.test',
      avatar: '/avatars/avatar03.png',
    }))

    await expect(updateMyProfile(profile)).resolves.toEqual({
      id: 7,
      username: 'bea',
      displayName: 'Beatriz',
      email: 'bea@new.test',
      avatar: '/avatars/avatar03.png',
    })

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/users/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Bea Player',
        email: 'bea@example.com',
        avatar: '/avatars/avatar02.png',
      }),
    })
  })

  it('throws when the profile endpoint returns an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, { status: 500 }))

    await expect(getMyProfile()).rejects.toThrow('Profile endpoint not available')

    consoleSpy.mockRestore()
  })
})
