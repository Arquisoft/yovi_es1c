import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth'
import { getFriendsOverview, type Friend } from '../../friends/api/friendsApi'
import { getMessagesWithFriend, sendMessageToFriend, type ChatMessage } from '../../friends/api/chatApi'
import styles from './MessagesPage.module.css'

const CHAT_REFRESH_INTERVAL_MS = 3000

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

function parseFriendId(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].reverse()
}

function mergeMessages(currentMessages: ChatMessage[], incomingMessages: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>()

  for (const message of currentMessages) {
    byId.set(message.id, message)
  }

  for (const message of incomingMessages) {
    byId.set(message.id, message)
  }

  return [...byId.values()].sort((a, b) => {
    const byDate = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return byDate !== 0 ? byDate : a.id - b.id
  })
}

export default function MessagesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { friendId } = useParams()
  const { t, i18n } = useTranslation()
  const [friends, setFriends] = useState<Friend[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isLoadingFriends, setIsLoadingFriends] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const selectedFriendId = useMemo(() => parseFriendId(friendId), [friendId])
  const activeFriend = selectedFriendId ? friends.find(friend => friend.id === selectedFriendId) ?? null : null
  const activeFriendId = activeFriend?.id ?? null
  const locale = i18n.resolvedLanguage ?? i18n.language
  const hasUnknownFriend = !isLoadingFriends && selectedFriendId !== null && !activeFriend

  useEffect(() => {
    let ignore = false

    async function loadFriends() {
      try {
        setIsLoadingFriends(true)
        setError(null)
        const overview = await getFriendsOverview()

        if (!ignore) {
          setFriends(overview.friends)
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : t('friendsLoadError'))
        }
      } finally {
        if (!ignore) {
          setIsLoadingFriends(false)
        }
      }
    }

    void loadFriends()

    return () => {
      ignore = true
    }
  }, [t])

  useEffect(() => {
    if (!user || activeFriendId === null) {
      setMessages([])
      setDraft('')
      return
    }

    const friendIdToLoad = activeFriendId
    let ignore = false
    let intervalId: number | undefined

    async function loadMessages(showLoading: boolean) {
      try {
        if (showLoading) {
          setIsLoadingMessages(true)
        }

        const data = await getMessagesWithFriend(friendIdToLoad, { limit: 50 })

        if (!ignore) {
          setError(null)
          setMessages(normalizeMessages(data.messages))
        }
      } catch (loadError) {
        if (!ignore && showLoading) {
          setError(loadError instanceof Error ? loadError.message : t('messagesLoadError'))
          setMessages([])
        }
      } finally {
        if (!ignore && showLoading) {
          setIsLoadingMessages(false)
        }
      }
    }

    setDraft('')
    void loadMessages(true)

    intervalId = window.setInterval(() => {
      void loadMessages(false)
    }, CHAT_REFRESH_INTERVAL_MS)

    return () => {
      ignore = true

      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
      }
    }
  }, [activeFriendId, t, user])

  useEffect(() => {
    const endElement = messagesEndRef.current

    if (endElement && typeof endElement.scrollIntoView === 'function') {
      endElement.scrollIntoView({ block: 'end' })
    }
  }, [messages])

  if (!user) {
    return <Navigate to="/login" replace />
  }

  function selectFriend(friend: Friend) {
    navigate(`/messages/${friend.id}`)
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (activeFriendId === null) {
      return
    }

    const friendIdToSend = activeFriendId
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }

    try {
      setIsSending(true)
      setError(null)

      const sent = await sendMessageToFriend(friendIdToSend, trimmed)
      setMessages(prev => mergeMessages(prev, [sent]))
      setDraft('')

      const refreshed = await getMessagesWithFriend(friendIdToSend, { limit: 50 })
      setMessages(normalizeMessages(refreshed.messages))
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('messagesSendError'))
    } finally {
      setIsSending(false)
    }
  }

  return (
      <section className={styles.page}>
        <div className={`${styles.card} crt-panel`}>
          <div className={styles.header}>
            <div>
              <p className="crt-screen-label">{t('socialSectionLabel')}</p>
              <h1 className={`${styles.title} crt-heading`}>{t('messagesTitle')}</h1>
            </div>
            <p className={styles.subtitle}>{t('messagesSubtitle')}</p>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          {isLoadingFriends ? <p className={styles.status}>{t('friendsLoading')}</p> : null}

          {!isLoadingFriends ? (
              <div className={styles.layout}>
                <aside className={styles.sidebar}>
                  <h2 className={styles.sectionTitle}>{t('messagesConversationsTitle')}</h2>
                  {friends.length === 0 ? <p className={styles.empty}>{t('messagesNoFriends')}</p> : null}

                  <div className={styles.friendList}>
                    {friends.map(friend => (
                        <button
                            key={friend.id}
                            type="button"
                            className={
                              friend.id === activeFriendId ? `${styles.friendButton} ${styles.friendButtonActive}` : styles.friendButton
                            }
                            onClick={() => selectFriend(friend)}
                        >
                          <span className={styles.friendName}>{friend.displayName ?? friend.username}</span>
                          <span className={styles.friendUsername}>@{friend.username}</span>
                        </button>
                    ))}
                  </div>
                </aside>

                <section className={styles.chatPanel}>
                  {activeFriend ? (
                      <>
                        <div className={styles.chatHeader}>
                          <div>
                            <h2 className={styles.sectionTitle}>
                              {t('messagesChatWith', { name: activeFriend.displayName ?? activeFriend.username })}
                            </h2>
                            <p className={styles.meta}>@{activeFriend.username}</p>
                          </div>
                          <button type="button" className={styles.secondaryButton} onClick={() => navigate('/messages')} disabled={isSending}>
                            {t('messagesClose')}
                          </button>
                        </div>

                        {isLoadingMessages ? <p className={styles.status}>{t('messagesLoadingChat')}</p> : null}

                        {!isLoadingMessages ? (
                            <>
                              <div className={styles.chatMessages}>
                                {messages.length === 0 ? <p className={styles.empty}>{t('messagesNoMessagesYet')}</p> : null}
                                {messages.map(message => (
                                    <div
                                        key={message.id}
                                        className={
                                          message.senderUserId === user.id
                                              ? `${styles.chatMessage} ${styles.chatMessageMine}`
                                              : styles.chatMessage
                                        }
                                    >
                                      <p className={styles.chatText}>{message.text}</p>
                                      <p className={styles.chatMeta}>{formatDate(message.createdAt, locale)}</p>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                              </div>

                              <form className={styles.chatComposer} onSubmit={handleSend}>
                                <input
                                    className={styles.input}
                                    aria-label={t('messagesInputLabel')}
                                    value={draft}
                                    onChange={event => setDraft(event.target.value)}
                                    placeholder={t('messagesInputPlaceholder')}
                                />
                                <button type="submit" className={styles.primaryButton} disabled={isSending || !draft.trim()}>
                                  {isSending ? t('messagesSending') : t('messagesSend')}
                                </button>
                              </form>
                            </>
                        ) : null}
                      </>
                  ) : (
                      <div className={styles.placeholder}>
                        <h2 className={styles.sectionTitle}>
                          {hasUnknownFriend ? t('messagesUnknownFriendTitle') : t('messagesSelectConversationTitle')}
                        </h2>
                        <p className={styles.empty}>
                          {hasUnknownFriend ? t('messagesUnknownFriendBody') : t('messagesSelectConversationBody')}
                        </p>
                        {hasUnknownFriend ? (
                            <button type="button" className={styles.secondaryButton} onClick={() => navigate('/friends')}>
                              {t('messagesBackToFriends')}
                            </button>
                        ) : null}
                      </div>
                  )}
                </section>
              </div>
          ) : null}
        </div>
      </section>
  )
}