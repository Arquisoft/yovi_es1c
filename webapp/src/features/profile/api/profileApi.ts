import { fetchWithAuth } from '../../../shared/api/fetchWithAuth'
import { API_CONFIG } from '../../../config/api.config'

export type Profile = {
  id: number
  username: string
  displayName: string
  email: string
  avatar: string | null
}

/*const PROFILE_STORAGE_KEY = 'mock_profile'

function getStoredMockProfile(): Profile | null {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as Profile
  } catch {
    localStorage.removeItem(PROFILE_STORAGE_KEY)
    return null
  }
}

function saveStoredMockProfile(profile: Profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}*/

export async function getMyProfile(): Promise<Profile> {
  try {
    const response = await fetchWithAuth(`${API_CONFIG.USERS_API}/me`)

    if (!response.ok) {
      throw new Error('Profile endpoint not available')
    }

    const data = await response.json()

    return {
      id: data.user_id ?? data.id ?? 0,
      username: data.username ?? '',
      displayName: data.displayName ?? data.username ?? '',
      email: data.email ?? '',
      avatar: data.avatar ?? null,
    }
  } catch (err){
    /*const authUserRaw = localStorage.getItem('auth_user')
    const authUser = authUserRaw ? JSON.parse(authUserRaw) as { id: number; username: string } : null

    const fallback =
      getStoredMockProfile() ??
      {
        id: authUser?.id ?? 0,
        username: authUser?.username ?? 'player',
        displayName: authUser?.username ?? 'player',
        email: '',
        avatar: null,
      }

    saveStoredMockProfile(fallback)
    return fallback*/

    console.error('Backend error:', err)
    throw err
  }
}

export async function updateMyProfile(profile: Profile): Promise<Profile> {
  try {
    const response = await fetchWithAuth(`${API_CONFIG.USERS_API}/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: profile.displayName,
        email: profile.email,
        avatar: profile.avatar,
      }),
    })

    if (!response.ok) {
      throw new Error('Profile update endpoint not available')
    }

    const data = await response.json()

    return {
      id: data.user_id ?? data.id ?? profile.id,
      username: data.username ?? profile.username,
      displayName: data.displayName ?? profile.displayName,
      email: data.email ?? profile.email,
      avatar: data.avatar ?? profile.avatar,
    }
  } catch (err){
    /*saveStoredMockProfile(profile)
    return profile*/
    console.error('Backend error:', err)
    throw err
  }
}
