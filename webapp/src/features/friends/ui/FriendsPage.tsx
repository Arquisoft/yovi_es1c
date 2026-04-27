import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import styles from './FriendsPage.module.css'

function formatDate(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function FriendsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [removingFriendId, setRemovingFriendId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const locale = i18n.resolvedLanguage ?? i18n.language

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
          setError(loadError instanceof Error ? loadError.message : t('friendsLoadError'))
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
  }, [t])

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const incomingRequests = requests.filter(request => request.direction === 'incoming')
  const outgoingRequests = requests.filter(request => request.direction === 'outgoing')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      setError(t('friendsWriteUsernameError'))
      return
    }

    try {
      setIsSending(true)
      setError(null)
      setSuccessMessage(null)

      const createdRequest = await sendFriendRequest(trimmedUsername)
      setRequests(prev => [createdRequest, ...prev])
      setUsername('')
      setSuccessMessage(t('friendsRequestSent', { username: createdRequest.user.username }))
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('friendsSendRequestError'))
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
      setSuccessMessage(t('friendsNowFriend', { username: acceptedRequest.user.username }))
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : t('friendsAcceptRequestError'))
    }
  }

  async function handleDelete(requestId: number, direction: 'incoming' | 'outgoing') {
    try {
      setError(null)
      setSuccessMessage(null)

      await deleteFriendRequest(requestId)
      setRequests(prev => prev.filter(request => request.id !== requestId))
      setSuccessMessage(direction === 'incoming' ? t('friendsInvitationRejected') : t('friendsInvitationCancelled'))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('friendsUpdateInvitationError'))
    }
  }

  async function handleUnfriend(friend: Friend) {
    const label = friend.displayName ?? friend.username
    const confirmed = window.confirm(t('friendsConfirmRemoveFriend', { name: label }))
    if (!confirmed) {
      return
    }

    try {
      setRemovingFriendId(friend.id)
      setError(null)
      setSuccessMessage(null)

      await deleteFriend(friend.id)
      setFriends(prev => prev.filter(item => item.id !== friend.id))
      setSuccessMessage(t('friendsRemoved', { name: label }))
    } catch (unfriendError) {
      setError(unfriendError instanceof Error ? unfriendError.message : t('friendsRemoveError'))
    } finally {
      setRemovingFriendId(null)
    }
  }

  function openMessages(friend: Friend) {
    navigate(`/messages/${friend.id}`)
  }

  return (
    <section className={styles.page}>
      <div className={`${styles.card} crt-panel`}>
        <div className={styles.header}>
          <div>
            <p className="crt-screen-label">{t('socialSectionLabel')}</p>
            <h1 className={`${styles.title} crt-heading`}>{t('friendsTitle')}</h1>
          </div>
          <p className={styles.subtitle}>{t('friendsSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.inviteForm}>
          <label className={styles.label}>
            {t('friendsUsernameLabel')}
            <input
              className={styles.input}
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder={t('friendsUsernamePlaceholder')}
            />
          </label>
          <button type="submit" disabled={isSending} className={styles.primaryButton}>
            {isSending ? t('friendsSendingInvitation') : t('friendsSendInvitation')}
          </button>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}
        {successMessage ? <p className={styles.success}>{successMessage}</p> : null}

        {isLoading ? <p className={styles.status}>{t('friendsLoading')}</p> : null}

        {!isLoading ? (
          <div className={styles.grid}>
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>{t('friendsIncomingInvitations')}</h2>
              {incomingRequests.length === 0 ? <p className={styles.empty}>{t('friendsNoIncomingInvitations')}</p> : null}
              {incomingRequests.map(request => (
                <article key={request.id} className={styles.item}>
                  <div>
                    <strong>{request.user.displayName ?? request.user.username}</strong>
                    <p className={styles.meta}>@{request.user.username}</p>
                    <p className={styles.meta}>{t('friendsReceivedAt', { date: formatDate(request.createdAt, locale) })}</p>
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={styles.primaryButton} onClick={() => handleAccept(request.id)}>
                      {t('friendsAccept')}
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => handleDelete(request.id, 'incoming')}>
                      {t('friendsReject')}
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>{t('friendsOutgoingInvitations')}</h2>
              {outgoingRequests.length === 0 ? <p className={styles.empty}>{t('friendsNoOutgoingInvitations')}</p> : null}
              {outgoingRequests.map(request => (
                <article key={request.id} className={styles.item}>
                  <div>
                    <strong>{request.user.displayName ?? request.user.username}</strong>
                    <p className={styles.meta}>@{request.user.username}</p>
                    <p className={styles.meta}>{t('friendsSentAt', { date: formatDate(request.createdAt, locale) })}</p>
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => handleDelete(request.id, 'outgoing')}>
                      {t('friendsCancel')}
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <section className={`${styles.panel} ${styles.fullWidth}`}>
              <h2 className={styles.sectionTitle}>{t('friendsMyFriends')}</h2>
              {friends.length === 0 ? <p className={styles.empty}>{t('friendsNoFriendsAdded')}</p> : null}
              <div className={styles.friendsList}>
                {friends.map(friend => (
                  <article key={friend.id} className={styles.friendCard}>
                    <div>
                      <strong>{friend.displayName ?? friend.username}</strong>
                      <p className={styles.meta}>@{friend.username}</p>
                      <p className={styles.meta}>{t('friendsSince', { date: formatDate(friend.friendsSince, locale) })}</p>
                    </div>
                    <div className={styles.actions}>
                      <button type="button" className={styles.primaryButton} onClick={() => openMessages(friend)}>
                        {t('friendsMessage')}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleUnfriend(friend)}
                        disabled={removingFriendId === friend.id}
                      >
                        {removingFriendId === friend.id ? t('friendsRemoving') : t('friendsRemove')}
                      </button>
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
