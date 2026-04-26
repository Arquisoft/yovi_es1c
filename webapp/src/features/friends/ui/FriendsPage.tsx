import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../auth'
import {
  acceptFriendRequest,
  deleteFriend,
  deleteFriendRequest,
  getFriendsOverview,
  sendFriendRequest,
  type Friend,
  type FriendRequest,
} from '../api/friendsApi'
import { getMessagesWithFriend, sendMessageToFriend, type ChatMessage } from '../api/chatApi'
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
  const [removingFriendId, setRemovingFriendId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [activeChatFriendId, setActiveChatFriendId] = useState<number | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isChatSending, setIsChatSending] = useState(false)

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

  async function handleUnfriend(friend: Friend) {
    const label = friend.displayName ?? friend.username
    const confirmed = window.confirm(`Eliminar a ${label} de tus amigos?`)
    if (!confirmed) {
      return
    }

    try {
      setRemovingFriendId(friend.id)
      setError(null)
      setSuccessMessage(null)

      await deleteFriend(friend.id)
      setFriends(prev => prev.filter(item => item.id !== friend.id))
      setSuccessMessage(`${label} eliminado de tus amigos`)
    } catch (unfriendError) {
      setError(unfriendError instanceof Error ? unfriendError.message : 'No se pudo eliminar el amigo')
    } finally {
      setRemovingFriendId(null)
    }
  }

  const activeChatFriend = activeChatFriendId
    ? friends.find(friend => friend.id === activeChatFriendId) ?? null
    : null

  async function openChat(friend: Friend) {
    try {
      setActiveChatFriendId(friend.id)
      setChatMessages([])
      setChatDraft('')
      setIsChatLoading(true)
      setError(null)
      setSuccessMessage(null)

      const data = await getMessagesWithFriend(friend.id, { limit: 50 })
      setChatMessages([...data.messages].reverse())
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : 'No se pudo cargar el chat')
    } finally {
      setIsChatLoading(false)
    }
  }

  async function handleSendChat() {
    if (!activeChatFriend) return

    const trimmed = chatDraft.trim()
    if (!trimmed) {
      return
    }

    try {
      setIsChatSending(true)
      setError(null)
      setSuccessMessage(null)

      const sent = await sendMessageToFriend(activeChatFriend.id, trimmed)
      setChatMessages(prev => [...prev, sent])
      setChatDraft('')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'No se pudo enviar el mensaje')
    } finally {
      setIsChatSending(false)
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
                    <div className={styles.actions}>
                      <button type="button" className={styles.primaryButton} onClick={() => void openChat(friend)}>
                        Chat
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleUnfriend(friend)}
                        disabled={removingFriendId === friend.id}
                      >
                        {removingFriendId === friend.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {activeChatFriend ? (
              <section className={`${styles.panel} ${styles.fullWidth}`}>
                <h2 className={styles.sectionTitle}>Chat con {activeChatFriend.displayName ?? activeChatFriend.username}</h2>
                {isChatLoading ? <p className={styles.status}>Cargando chat...</p> : null}
                {!isChatLoading ? (
                  <div className={styles.chatBox}>
                    <div className={styles.chatMessages}>
                      {chatMessages.length === 0 ? <p className={styles.empty}>Todavia no hay mensajes.</p> : null}
                      {chatMessages.map(message => (
                        <div
                          key={message.id}
                          className={
                            message.senderUserId === user.id ? `${styles.chatMessage} ${styles.chatMessageMine}` : styles.chatMessage
                          }
                        >
                          <p className={styles.chatText}>{message.text}</p>
                          <p className={styles.chatMeta}>{formatDate(message.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                    <div className={styles.chatComposer}>
                      <input
                        className={styles.input}
                        value={chatDraft}
                        onChange={event => setChatDraft(event.target.value)}
                        placeholder="Escribe un mensaje"
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void handleSendChat()
                          }
                        }}
                      />
                      <button type="button" className={styles.primaryButton} onClick={() => void handleSendChat()} disabled={isChatSending}>
                        {isChatSending ? 'Enviando...' : 'Enviar'}
                      </button>
                      <button type="button" className={styles.secondaryButton} onClick={() => setActiveChatFriendId(null)} disabled={isChatSending}>
                        Cerrar
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
