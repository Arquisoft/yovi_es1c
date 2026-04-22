import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../auth'
import { getMyProfile, updateMyProfile, type Profile } from '../api/profileApi'
import styles from './ProfilePage.module.css'

export default function ProfilePage() {
    const { user } = useAuth()

    const [profile, setProfile] = useState<Profile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    useEffect(() => {
        let ignore = false

        async function loadProfile() {
            try {
                setIsLoading(true)
                const data = await getMyProfile()
                if (!ignore) {
                    setProfile(data)
                }
            } catch {
                if (!ignore) {
                    setError('No se pudo cargar el perfil')
                }
            } finally {
                if (!ignore) {
                    setIsLoading(false)
                }
            }
        }

        void loadProfile()

        return () => {
            ignore = true
        }
    }, [])

    if (!user) {
        return <Navigate to="/login" replace />
    }

    if (isLoading) {
        return <section className={styles.page}><p>Cargando perfil...</p></section>
    }

    if (!profile) {
        return <section className={styles.page}><p>No se pudo cargar el perfil.</p></section>
    }

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const { name, value } = event.target
        setProfile(prev => (prev ? { ...prev, [name]: value } : prev))
        setSuccessMessage(null)
    }

    function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        if (!file) return

        const previewUrl = URL.createObjectURL(file)

        setProfile(prev => (prev ? { ...prev, avatar: previewUrl } : prev))
        setSuccessMessage(null)
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (!profile) return

        setIsSaving(true)

        try {
            const updated = await updateMyProfile(profile)
            setProfile(updated)
        } finally {
            setIsSaving(false)
        }
    }
    return (
        <section className={styles.page}>
            <div className={styles.card}>
                <h1 className={styles.title}>Mi perfil</h1>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.avatarSection}>
                        <div className={styles.avatarFrame}>
                            {profile.avatar ? (
                                <img src={profile.avatar} alt="Avatar del jugador" className={styles.avatarImage} />
                            ) : (
                                <div className={styles.avatarPlaceholder}>
                                    {profile.displayName.slice(0, 1).toUpperCase()}
                                </div>
                            )}
                        </div>

                        <label className={styles.uploadButton}>
                            Cambiar avatar
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleAvatarChange}
                                className={styles.hiddenInput}
                            />
                        </label>
                    </div>

                    <label className={styles.label}>
                        Nombre de usuario
                        <input
                            name="username"
                            value={profile.username}
                            disabled
                            className={styles.input}
                        />
                    </label>

                    <label className={styles.label}>
                        Nombre visible
                        <input
                            name="displayName"
                            value={profile.displayName}
                            onChange={handleChange}
                            className={styles.input}
                        />
                    </label>

                    <label className={styles.label}>
                        Correo
                        <input
                            name="email"
                            type="email"
                            value={profile.email}
                            onChange={handleChange}
                            className={styles.input}
                        />
                    </label>

                    {error ? <p className={styles.error}>{error}</p> : null}
                    {successMessage ? <p className={styles.success}>{successMessage}</p> : null}

                    <div className={styles.actions}>
                        <button type="submit" disabled={isSaving} className={styles.saveButton}>
                            {isSaving ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    )
}
