import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import { AuthProvider, useAuth } from '../features/auth'

describe('AuthContext', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('should handle corrupted localStorage data gracefully', () => {
        localStorage.setItem('auth_user', '{invalid json')
        localStorage.setItem('auth_token', 'token123')

        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const TestComponent = () => {
            const auth = useAuth()
            return <div>{auth.user ? 'logged in' : 'logged out'}</div>
        }

        const { getByText } = render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        )

        expect(getByText('logged out')).toBeInTheDocument()
        expect(localStorage.getItem('auth_user')).toBeNull()
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error parsing'), expect.any(Error))

        spy.mockRestore()
    })

    it('should clear localStorage when user object is invalid', () => {
        localStorage.setItem('auth_user', JSON.stringify({ invalid: 'user' }))
        localStorage.setItem('auth_token', 'token123')

        const TestComponent = () => {
            const auth = useAuth()
            return <div>{auth.user ? 'logged in' : 'logged out'}</div>
        }

        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        )

        expect(localStorage.getItem('auth_user')).toBeNull()
        expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('should throw error when useAuth is used outside AuthProvider', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const suppressJsdomError = (event: Event) => {
            event.preventDefault()
        }
        window.addEventListener('error', suppressJsdomError)

        const TestComponent = () => {
            useAuth() // Esto debe lanzar error
            return <div>test</div>
        }

        class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
            constructor(props: { children: React.ReactNode }) {
                super(props)
                this.state = { hasError: false }
            }

            static getDerivedStateFromError() {
                return { hasError: true }
            }

            render() {
                if (this.state.hasError) {
                    return <div>hook error</div>
                }
                return this.props.children
            }
        }

        const { getByText } = render(
            <ErrorBoundary>
                <TestComponent />
            </ErrorBoundary>
        )
        expect(getByText('hook error')).toBeInTheDocument()

        window.removeEventListener('error', suppressJsdomError)
        consoleSpy.mockRestore()
    })
})