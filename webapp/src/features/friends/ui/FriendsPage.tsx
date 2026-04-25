import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../auth'
import {
  acceptFriendRequest,
  deleteFriendRequest,
  getFriendsOverview,
  sendFriendRequest,
  type Friend,
  type FriendRequest,
} from '../api/friendsApi'
import styles from './FriendsPage.module.css'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function FriendsPage() {
  const { user } = useAuth()
  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function loadOverview() {
      try {
        setIsLoading(true)
        setError(null)
        const data = await getFriendsOverview()

        if (!ignore) {
          setFriends(data.friends)
          setRequests(data.requests)
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar amigos')
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    void loadOverview()

    return () => {
      ignore = true
    }
  }, [])

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const incomingRequests = requests.filter(request => request.direction === 'incoming')
  const outgoingRequests = requests.filter(request => request.direction === 'outgoing')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      setError('Escribe un nombre de usuario')
      return
    }

    try {
      setIsSending(true)
      setError(null)
      setSuccessMessage(null)

      const createdRequest = await sendFriendRequest(trimmedUsername)
      setRequests(prev => [createdRequest, ...prev])
      setUsername('')
      setSuccessMessage(`Invitacion enviada a ${createdRequest.user.username}`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo enviar la invitacion')
    } finally {
      setIsSending(false)
    }
  }

  async function handleAccept(requestId: number) {
    try {
      setError(null)
      setSuccessMessage(null)

      const acceptedRequest = await acceptFriendRequest(requestId)

      setRequests(prev => prev.filter(request => request.id !== requestId))
      setFriends(prev => [
        {
          id: acceptedRequest.user.id,
          username: acceptedRequest.user.username,
          displayName: acceptedRequest.user.displayName,
          avatar: acceptedRequest.user.avatar,
          friendsSince: new Date().toISOString(),
        },
        ...prev,
      ])
      setSuccessMessage(`Ahora eres amigo de ${acceptedRequest.user.username}`)
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'No se pudo aceptar la invitacion')
    }
  }

  async function handleDelete(requestId: number, direction: 'incoming' | 'outgoing') {
    try {
      setError(null)
      setSuccessMessage(null)

      await deleteFriendRequest(requestId)
      setRequests(prev => prev.filter(request => request.id !== requestId))
      setSuccessMessage(direction === 'incoming' ? 'Invitacion rechazada' : 'Invitacion cancelada')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo actualizar la invitacion')
    }
  }

  return (
    <section className={styles.page}>
      <div className={`${styles.card} crt-panel`}>
        <div className={styles.header}>
          <div>
            <p className="crt-screen-label">Social</p>
            <h1 className={`${styles.title} crt-heading`}>Amigos</h1>
          </div>
          <p className={styles.subtitle}>Envia invitaciones por nombre de usuario y gestiona tus solicitudes pendientes.</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.inviteForm}>
          <label className={styles.label}>
            Nombre de usuario
            <input
              className={styles.input}
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder="Escribe el username exacto"
            />
          </label>
          <button type="submit" disabled={isSending} className={styles.primaryButton}>
            {isSending ? 'Enviando...' : 'Enviar invitacion'}
          </button>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}
        {successMessage ? <p className={styles.success}>{successMessage}</p> : null}

        {isLoading ? <p className={styles.status}>Cargando amigos...</p> : null}

        {!isLoading ? (
          <div className={styles.grid}>
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Invitaciones recibidas</h2>
              {incomingRequests.length === 0 ? <p className={styles.empty}>No tienes invitaciones pendientes.</p> : null}
              {incomingRequests.map(request => (
                <article key={request.id} className={styles.item}>
                  <div>
                    <strong>{request.user.displayName ?? request.user.username}</strong>
                    <p className={styles.meta}>@{request.user.username}</p>
                    <p className={styles.meta}>Recibida: {formatDate(request.createdAt)}</p>
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={styles.primaryButton} onClick={() => handleAccept(request.id)}>
                      Aceptar
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => handleDelete(request.id, 'incoming')}>
                      Rechazar
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>Invitaciones enviadas</h2>
              {outgoingRequests.length === 0 ? <p className={styles.empty}>No has enviado invitaciones pendientes.</p> : null}
              {outgoingRequests.map(request => (
                <article key={request.id} className={styles.item}>
                  <div>
                    <strong>{request.user.displayName ?? request.user.username}</strong>
                    <p className={styles.meta}>@{request.user.username}</p>
                    <p className={styles.meta}>Enviada: {formatDate(request.createdAt)}</p>
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => handleDelete(request.id, 'outgoing')}>
                      Cancelar
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <section className={`${styles.panel} ${styles.fullWidth}`}>
              <h2 className={styles.sectionTitle}>Mis amigos</h2>
              {friends.length === 0 ? <p className={styles.empty}>Todavia no tienes amigos agregados.</p> : null}
              <div className={styles.friendsList}>
                {friends.map(friend => (
                  <article key={friend.id} className={styles.friendCard}>
                    <div>
                      <strong>{friend.displayName ?? friend.username}</strong>
                      <p className={styles.meta}>@{friend.username}</p>
                      <p className={styles.meta}>Amigos desde: {formatDate(friend.friendsSince)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </section>
  )
}
