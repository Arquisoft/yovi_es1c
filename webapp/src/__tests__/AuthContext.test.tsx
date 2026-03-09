// webapp/src/features/auth/context/__tests__/AuthContext.test.tsx

import { describe, it, expect, beforeEach, vi } from 'vitest'
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
        const TestComponent = () => {
            useAuth() // Esto debe lanzar error
            return <div>test</div>
        }

        expect(() => render(<TestComponent />)).toThrow(
            'useAuth must be used within AuthProvider'
        )
    })
})
