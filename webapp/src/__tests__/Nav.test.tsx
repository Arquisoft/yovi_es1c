import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Nav from '../components/layout/Nav'
import { useAuth } from '../features/auth'
import { logoutSession } from '../features/auth/api/authApi'

vi.mock('../features/auth', () => ({
    useAuth: vi.fn(),
}))

vi.mock('../components/layout/LanguageSwitcher', () => ({
    default: () => <span>Language switcher</span>,
}))

vi.mock('../features/auth/api/authApi', () => ({
    logoutSession: vi.fn(),
}))

const useAuthMock = vi.mocked(useAuth)
const logoutSessionMock = vi.mocked(logoutSession)
const logoutMock = vi.fn()

function renderNav(initialEntry = '/') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Nav />
        </MemoryRouter>,
    )
}

describe('Nav Component', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        logoutSessionMock.mockResolvedValue()
        useAuthMock.mockReturnValue({
            token: null,
            refreshToken: null,
            user: null,
            login: vi.fn(),
            logout: logoutMock,
            updateTokens: vi.fn(),
        })
    })

    it('renders navigation links', () => {
        renderNav()

        expect(screen.getByText('Inicio')).toBeInTheDocument()
        expect(screen.getByText('Nueva partida')).toBeInTheDocument()
        expect(screen.getByText('Estadísticas')).toBeInTheDocument()
    })

    it('shows login and register links when not authenticated', () => {
        renderNav()

        expect(screen.getByText('Iniciar sesión')).toBeInTheDocument()
        expect(screen.getByText('Registrarse')).toBeInTheDocument()
    })

    it('handles dark mode detection at mount', () => {
        act(() => {
            window.__setMatchMedia?.(true)
        })

        renderNav()

        expect(screen.getByAltText('Game Y Logo')).toBeInTheDocument()
    })

    it('applies dark mode class if prefers-color-scheme is dark', () => {
        window.__setMatchMedia?.(true)

        renderNav()

        const nav = document.querySelector('nav')
        expect(nav?.className).toContain('dark')
    })

    it('handles media query change events', () => {
        renderNav()

        act(() => {
            window.__setMatchMedia?.(true)
            window.__setMatchMedia?.(false)
        })

        expect(screen.getByText('Inicio')).toBeInTheDocument()
    })

    it('handles scroll events to show and hide nav', () => {
        renderNav()

        Object.defineProperty(globalThis, 'scrollY', { writable: true, value: 100 })
        fireEvent.scroll(globalThis as unknown as Window)

        Object.defineProperty(globalThis, 'scrollY', { writable: true, value: 50 })
        fireEvent.scroll(globalThis as unknown as Window)

        Object.defineProperty(globalThis, 'scrollY', { writable: true, value: 0 })
        fireEvent.scroll(globalThis as unknown as Window)

        expect(screen.getByText('Inicio')).toBeInTheDocument()
    })

    it('shows friends, messages, username and logout button when authenticated', () => {
        useAuthMock.mockReturnValue({
            token: 'test-token',
            refreshToken: 'refresh-token',
            user: { id: 1, username: 'Pablo' },
            login: vi.fn(),
            logout: logoutMock,
            updateTokens: vi.fn(),
        })

        renderNav()

        expect(screen.getByText('Amigos')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /mensajes/i })).toBeInTheDocument()
        expect(screen.getByText('Pablo')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument()
    })

    it('marks messages as active on nested message routes', () => {
        useAuthMock.mockReturnValue({
            token: 'test-token',
            refreshToken: 'refresh-token',
            user: { id: 1, username: 'Pablo' },
            login: vi.fn(),
            logout: logoutMock,
            updateTokens: vi.fn(),
        })

        renderNav('/messages/2')

        expect(screen.getByRole('link', { name: /mensajes/i }).className).toContain('active')
    })

    it('logs out through the auth service and local auth state', async () => {
        useAuthMock.mockReturnValue({
            token: 'test-token',
            refreshToken: 'refresh-token',
            user: { id: 1, username: 'Pablo' },
            login: vi.fn(),
            logout: logoutMock,
            updateTokens: vi.fn(),
        })

        renderNav()
        fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))

        await waitFor(() => expect(logoutSessionMock).toHaveBeenCalled())
        expect(logoutMock).toHaveBeenCalled()
    })
})
