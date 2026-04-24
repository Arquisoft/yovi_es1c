import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth'
import { getMyProfile, updateMyProfile, type Profile } from '../api/profileApi'
import { AVATAR_OPTIONS, DEFAULT_AVATAR } from './avatarOptions'
import styles from './ProfilePage.module.css'


export default function ProfilePage() {
    const { user } = useAuth()

    const [profile, setProfile] = useState<Profile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const navigate = useNavigate()

    useEffect(() => {
        let ignore = false

        async function loadProfile() {
            try {
                setIsLoading(true)
                setError(null)

                const data = await getMyProfile()

                if (!ignore) {
                    setProfile({
                        ...data,
                        avatar: data.avatar ?? DEFAULT_AVATAR,
                    })
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
        return (
            <section className={styles.page}>
                <p>Cargando perfil...</p>
            </section>
        )
    }

    if (!profile) {
        return (
            <section className={styles.page}>
                <p>No se pudo cargar el perfil.</p>
            </section>
        )
    }

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const { name, value } = event.target
        setProfile(prev => (prev ? { ...prev, [name]: value } : prev))
        setSuccessMessage(null)
        setError(null)
    }

    function handleAvatarSelect(avatar: string) {
        setProfile(prev => (prev ? { ...prev, avatar } : prev))
        setIsAvatarPickerOpen(false)
        setSuccessMessage(null)
        setError(null)
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (!profile) return

        setIsSaving(true)
        setError(null)
        setSuccessMessage(null)

        try {
            const updated = await updateMyProfile(profile)
            setProfile(updated)
            navigate(-1)
        } catch {
            setError('No se pudo guardar el perfil')
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
                                <img
                                    src={profile.avatar}
                                    alt="Avatar del jugador"
                                    className={styles.avatarImage}
                                />
                            ) : (
                                <div className={styles.avatarPlaceholder}>
                                    {profile.displayName.slice(0, 1).toUpperCase()}
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            className={styles.uploadButton}
                            onClick={() => setIsAvatarPickerOpen(prev => !prev)}
                        >
                            {isAvatarPickerOpen ? 'Ocultar avatares' : 'Cambiar avatar'}
                        </button>

                        {isAvatarPickerOpen ? (
                            <div className={styles.avatarPicker}>
                                {AVATAR_OPTIONS.map(avatar => (
                                    <button
                                        key={avatar}
                                        type="button"
                                        className={`${styles.avatarOption} ${profile.avatar === avatar ? styles.avatarOptionSelected : ''
                                            }`}
                                        onClick={() => handleAvatarSelect(avatar)}
                                        aria-label={`Seleccionar ${avatar}`}
                                    >
                                        <img src={avatar} alt="" className={styles.avatarOptionImage} />
                                    </button>
                                ))}
                            </div>
                        ) : null}
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
