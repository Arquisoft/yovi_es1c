import { type ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../features/auth/context/AuthContext'

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
    withAuth?: boolean
    withRouter?: boolean
}

export function renderWithProviders(
    ui: ReactElement,
    {
        withAuth = true,
        withRouter = true,
        ...renderOptions
    }: CustomRenderOptions = {}
) {
    let Wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>

    if (withAuth) {
        const PrevWrapper = Wrapper
        Wrapper = ({ children }) => (
            <PrevWrapper>
                <AuthProvider>{children}</AuthProvider>
            </PrevWrapper>
        )
    }

    if (withRouter) {
        const PrevWrapper = Wrapper
        Wrapper = ({ children }) => (
            <PrevWrapper>
                <BrowserRouter>{children}</BrowserRouter>
            </PrevWrapper>
        )
    }

    return render(ui, { wrapper: Wrapper, ...renderOptions })
}
export function setupAuthenticatedUser(
    user: { id: number; username: string } = { id: 1, username: 'testuser' },
    token: string = 'fake-jwt-token'
) {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    return { token, user }
}

export function clearAuth() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
}

export {
    screen,
    render,
    waitFor,
    within,
    fireEvent,
    act
} from '@testing-library/react'
