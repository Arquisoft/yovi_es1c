import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProfilePage from '../features/profile/ui/ProfilePage'
import { useAuth } from '../features/auth'
import { getMyProfile, updateMyProfile } from '../features/profile/api/profileApi'

vi.mock('../features/auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../features/profile/api/profileApi', () => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
}))

const useAuthMock = vi.mocked(useAuth)
const getMyProfileMock = vi.mocked(getMyProfile)
const updateMyProfileMock = vi.mocked(updateMyProfile)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({
      token: 'token',
      refreshToken: 'refresh',
      user: { id: 1, username: 'alice' },
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })
  })

  it('loads the authenticated profile and saves edited fields', async () => {
    getMyProfileMock.mockResolvedValueOnce({
      id: 1,
      username: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      avatar: '/avatars/avatar01.png',
    })
    updateMyProfileMock.mockResolvedValueOnce({
      id: 1,
      username: 'alice',
      displayName: 'Alice Pro',
      email: 'alice@new.test',
      avatar: '/avatars/avatar01.png',
    })

    renderPage()

    expect(await screen.findByDisplayValue('Alice')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Nombre visible/i), { target: { value: 'Alice Pro' } })
    fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: 'alice@new.test' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(() => {
      expect(updateMyProfileMock).toHaveBeenCalledWith(expect.objectContaining({
        id: 1,
        username: 'alice',
        displayName: 'Alice Pro',
        email: 'alice@new.test',
      }))
    })
  })

  it('lets the user choose one of the predefined avatars before saving', async () => {
    getMyProfileMock.mockResolvedValueOnce({
      id: 1,
      username: 'alice',
      displayName: 'Alice',
      email: '',
      avatar: '/avatars/avatar01.png',
    })
    updateMyProfileMock.mockImplementationOnce(async profile => profile)

    renderPage()

    await screen.findByText('Mi perfil')
    fireEvent.click(screen.getByRole('button', { name: /Cambiar avatar/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar /avatars/avatar02.png' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(() => {
      expect(updateMyProfileMock).toHaveBeenCalledWith(expect.objectContaining({
        avatar: '/avatars/avatar02.png',
      }))
    })
  })

  it('shows a load error when the profile cannot be fetched', async () => {
    getMyProfileMock.mockRejectedValueOnce(new Error('backend down'))

    renderPage()

    expect(await screen.findByText('No se pudo cargar el perfil.')).toBeInTheDocument()
  })
})
