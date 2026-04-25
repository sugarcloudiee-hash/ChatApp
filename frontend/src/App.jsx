import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { io } from 'socket.io-client'

let supabaseClient = null

const getSupabaseClient = () => {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || window.SUPABASE_URL || ''
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || ''

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase credentials not found, theme sync disabled')
    return null
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }

  return supabaseClient
}

function App() {
  const [frameKey, setFrameKey] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [showChatStage, setShowChatStage] = useState(false)
  const [theme, setTheme] = useState('dark')
  const [user, setUser] = useState(null)
  const [userEmail, setUserEmail] = useState(null)
  const [authToken, setAuthToken] = useState('')
  const [supabaseReady, setSupabaseReady] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [socialTab, setSocialTab] = useState('notifications')
  const [socialLoading, setSocialLoading] = useState(false)
  const [socialError, setSocialError] = useState('')
  const [notifications, setNotifications] = useState([])
  const [friends, setFriends] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [conversations, setConversations] = useState([])
  const [selectedFriend, setSelectedFriend] = useState('')
  const [dmMessages, setDmMessages] = useState([])
  const [dmInput, setDmInput] = useState('')

  const statusText = useMemo(() => (isLoaded ? 'You are in' : 'Starting up...'), [isLoaded])
  const authSubmitText = useMemo(() => (authMode === 'signin' ? 'Sign in' : 'Create account'), [authMode])
  const snowflakes = useMemo(() => Array.from({ length: 28 }, (_, index) => index), [])
  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  )

  const applyTheme = (nextTheme) => {
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
  }

  const loadThemeByEmail = async (client, emailValue) => {
    if (!client || !emailValue) {
      return
    }

    try {
      const { data: userData, error } = await client
        .from('user')
        .select('theme')
        .eq('email', emailValue)
        .single()

      if (!error && userData?.theme) {
        applyTheme(userData.theme)
      }
    } catch (err) {
      console.warn('Theme fetch failed:', err)
    }
  }

  useEffect(() => {
    const handleThemeRequest = (event) => {
      if (event.data && event.data.type === 'THEME_REQUEST') {
        const iframe = document.querySelector('.legacy-frame')
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'THEME_CHANGE', theme }, '*')
        }
      }
    }

    window.addEventListener('message', handleThemeRequest)
    return () => window.removeEventListener('message', handleThemeRequest)
  }, [theme])

  useEffect(() => {
    const iframe = document.querySelector('.legacy-frame')
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'THEME_CHANGE', theme }, '*')
    }
  }, [theme, isLoaded])

  useEffect(() => {
    let isMounted = true
    let authSubscription = null

    const bootstrapSession = async () => {
      const client = getSupabaseClient()

      if (!client) {
        if (isMounted) {
          applyTheme('dark')
          setSupabaseReady(false)
          setAuthToken('')
        }
        return
      }

      if (isMounted) {
        setSupabaseReady(true)
      }

      try {
        const {
          data: { session },
          error: sessionError,
        } = await client.auth.getSession()

        if (sessionError) {
          console.warn('Session error:', sessionError)
          applyTheme('dark')
          return
        }

        if (session?.user) {
          const activeEmail = session.user.email || ''
          if (isMounted) {
            setUser(session.user)
            setUserEmail(activeEmail)
            const token = session.access_token || ''
            setAuthToken(token)
          }
          if (isMounted) {
            await loadThemeByEmail(client, activeEmail)
          }
        } else if (isMounted) {
          applyTheme('dark')
          setAuthToken('')
        }
      } catch (err) {
        console.warn('Session bootstrap failed:', err)
        if (isMounted) {
          applyTheme('dark')
          setAuthToken('')
        }
      }

      const { data: authListener } = client.auth.onAuthStateChange(async (_event, session) => {
        if (!isMounted) {
          return
        }

        if (!session?.user) {
          setUser(null)
          setUserEmail(null)
          setAuthToken('')
          setIsLoaded(false)
          return
        }

        const activeEmail = session.user.email || ''
        setUser(session.user)
        setUserEmail(activeEmail)
        const token = session.access_token || ''
        setAuthToken(token)
        await loadThemeByEmail(client, activeEmail)
      })

      authSubscription = authListener.subscription
    }

    bootstrapSession()

    return () => {
      isMounted = false
      if (authSubscription) {
        authSubscription.unsubscribe()
      }
    }
  }, [])

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client || !supabaseReady || !userEmail) return

    const themeSubscription = client
      .channel(`theme-changes-${userEmail}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user',
          filter: `email=eq.${userEmail}`,
        },
        (payload) => {
          if (payload.new && payload.new.theme) {
            const newTheme = payload.new.theme
            applyTheme(newTheme)
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Theme sync subscription active')
        }
      })

    return () => {
      try {
        themeSubscription.unsubscribe()
      } catch (err) {
        console.warn('Theme subscription cleanup failed:', err)
      }
    }
  }, [supabaseReady, userEmail])

  const apiRequest = useCallback(
    async (path, options = {}) => {
      if (!authToken) {
        throw new Error('Missing auth session token.')
      }

      const response = await fetch(path, {
        ...options,
        headers: {
          Authorization: `Bearer ${authToken}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status})`)
      }
      return data
    },
    [authToken],
  )

  const loadSocialData = useCallback(async () => {
    if (!user || !authToken) {
      return
    }

    setSocialLoading(true)
    setSocialError('')
    try {
      const [friendsData, requestData, notificationData, chatsData] = await Promise.all([
        apiRequest('/social/friends'),
        apiRequest('/social/friend-requests'),
        apiRequest('/social/notifications?limit=50'),
        apiRequest('/social/chats'),
      ])

      setFriends(friendsData.friends || [])
      setIncomingRequests(requestData.incoming || [])
      setOutgoingRequests(requestData.outgoing || [])
      setNotifications(notificationData.notifications || [])
      setConversations(chatsData.conversations || [])
    } catch (err) {
      setSocialError(err.message || 'Failed to load social data.')
    } finally {
      setSocialLoading(false)
    }
  }, [apiRequest, authToken, user])

  useEffect(() => {
    if (!user || !authToken) return

    loadSocialData()

    const socialSocket = io('/social', {
      transports: ['polling'],
      upgrade: false,
      auth: {
        access_token: authToken,
      },
    })

    socialSocket.on('social_refresh', () => {
      loadSocialData()
    })

    socialSocket.on('connect', () => {
      loadSocialData()
    })

    socialSocket.on('connect_error', () => {
      setSocialError('Realtime social connection unavailable. Using fallback transport.')
    })

    return () => {
      socialSocket.disconnect()
    }
  }, [loadSocialData, user, authToken])

  const loadConversation = async (friendUsername) => {
    if (!friendUsername) return
    try {
      const data = await apiRequest(`/social/chats/${encodeURIComponent(friendUsername)}/messages`)
      setSelectedFriend(friendUsername)
      setDmMessages(data.messages || [])
      setConversations((current) =>
        current.map((row) =>
          row.friend.username === friendUsername
            ? {
                ...row,
                unread: 0,
              }
            : row,
        ),
      )
    } catch (err) {
      setSocialError(err.message || 'Failed to load direct messages.')
    }
  }

  const handleSearchUsers = async () => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }

    try {
      const data = await apiRequest(`/social/users/search?q=${encodeURIComponent(q)}`)
      setSearchResults(data.users || [])
    } catch (err) {
      setSocialError(err.message || 'User search failed.')
    }
  }

  const sendFriendRequest = async (usernameValue) => {
    try {
      await apiRequest('/social/friend-requests', {
        method: 'POST',
        body: JSON.stringify({ username: usernameValue }),
      })
      await loadSocialData()
    } catch (err) {
      setSocialError(err.message || 'Could not send friend request.')
    }
  }

  const respondToRequest = async (requestId, action) => {
    try {
      await apiRequest(`/social/friend-requests/${requestId}/${action}`, {
        method: 'POST',
      })
      await loadSocialData()
    } catch (err) {
      setSocialError(err.message || 'Could not process friend request.')
    }
  }

  const sendDirectMessage = async () => {
    const clean = dmInput.trim()
    if (!selectedFriend || !clean) return

    try {
      const data = await apiRequest(`/social/chats/${encodeURIComponent(selectedFriend)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: clean }),
      })
      setDmMessages((current) => [...current, data.message])
      setDmInput('')
      await loadSocialData()
    } catch (err) {
      setSocialError(err.message || 'Could not send message.')
    }
  }

  const markNotificationsRead = async () => {
    try {
      await apiRequest('/social/notifications/read-all', { method: 'POST' })
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
    } catch (err) {
      setSocialError(err.message || 'Could not mark notifications as read.')
    }
  }

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(newTheme)

    if (authToken && userEmail) {
      try {
        await apiRequest('/theme', {
          method: 'PATCH',
          body: JSON.stringify({ theme: newTheme }),
        })
      } catch (err) {
        console.warn('Failed to save theme preference:', err)
      }
    }
  }

  const handleReload = () => {
    setIsLoaded(false)
    setFrameKey((current) => current + 1)
  }

  const handleSignOut = async () => {
    const client = getSupabaseClient()

    if (!client) {
      setUser(null)
      setUserEmail(null)
      setAuthToken('')
      return
    }

    try {
      const { error } = await client.auth.signOut()
      if (error) {
        console.warn('Sign out failed:', error)
      }
    } catch (err) {
      console.warn('Sign out failed:', err)
    }

    setUser(null)
    setUserEmail(null)
    setAuthToken('')
    setIsLoaded(false)
    setShowChatStage(false)
    setNotifications([])
    setFriends([])
    setIncomingRequests([])
    setOutgoingRequests([])
    setConversations([])
    setSelectedFriend('')
    setDmMessages([])
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthSuccess('')

    const client = getSupabaseClient()

    if (!client) {
      setAuthError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    if (!email.trim() || !password) {
      setAuthError('Email and password are required.')
      return
    }

    if (authMode === 'signup' && password !== confirmPassword) {
      setAuthError('Passwords do not match.')
      return
    }

    setAuthLoading(true)

    try {
      if (authMode === 'signin') {
        const { data, error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) {
          throw error
        }

        if (data?.user) {
          setUser(data.user)
          setUserEmail(data.user.email || email.trim())
          setAuthToken(data.session?.access_token || '')
        }
      } else {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
        })

        if (error) {
          throw error
        }

        if (!data?.session) {
          setAuthSuccess('Account created. Check your email to verify, then sign in.')
          setAuthMode('signin')
          setConfirmPassword('')
          setPassword('')
          setAuthLoading(false)
          return
        }

        if (data.user) {
          setUser(data.user)
          setUserEmail(data.user.email || email.trim())
          setAuthToken(data.session?.access_token || '')
        }
      }

      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setAuthError(err?.message || 'Authentication failed. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  if (!user) {
    return (
      <main className="app-shell app-shell-auth" aria-label="Authentication">
        <div className="ambient-glow" aria-hidden="true" />

        <section className="auth-surface">
          <div className="auth-layout">
            <aside className="auth-visual" aria-hidden="true">
              <div className="scene-glow" />
              <div className="scene-sun-moon" />
              <div className="scene-mountain mountain-back" />
              <div className="scene-mountain mountain-mid" />
              <div className="scene-mountain mountain-front" />
              <div className="scene-ground" />
              <div className="snow-layer">
                {snowflakes.map((flake) => (
                  <span
                    key={flake}
                    className="snowflake"
                    style={{
                      '--x': `${(flake * 37) % 100}%`,
                      '--delay': `${(flake % 12) * -0.9}s`,
                      '--duration': `${7 + (flake % 6)}s`,
                      '--size': `${2 + (flake % 4)}px`,
                    }}
                  />
                ))}
              </div>
            </aside>

            <section className="auth-card" aria-label="Sign in and sign up">
              <div className="auth-header">
                <button
                  type="button"
                  className="theme-toggle-btn"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                  title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                  {theme === 'dark' ? 'Sun' : 'Moon'}
                </button>
              </div>

              <div className="auth-mode-toggle" role="tablist" aria-label="Auth mode">
                <button
                  type="button"
                  className={`mode-chip ${authMode === 'signin' ? 'active' : ''}`}
                  onClick={() => {
                    setAuthMode('signin')
                    setAuthError('')
                    setAuthSuccess('')
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`mode-chip ${authMode === 'signup' ? 'active' : ''}`}
                  onClick={() => {
                    setAuthMode('signup')
                    setAuthError('')
                    setAuthSuccess('')
                  }}
                >
                  Sign up
                </button>
              </div>

              <form className="auth-form" onSubmit={handleAuthSubmit}>
                <label className="auth-field">
                  <span>Email</span>
                  <input
                    className="auth-input"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="auth-field">
                  <span>Password</span>
                  <input
                    className="auth-input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                    required
                  />
                </label>

                {authMode === 'signup' && (
                  <label className="auth-field">
                    <span>Confirm password</span>
                    <input
                      className="auth-input"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                )}

                {authError && <p className="auth-feedback auth-error">{authError}</p>}
                {authSuccess && <p className="auth-feedback auth-success">{authSuccess}</p>}

                <button type="submit" className="primary-button auth-submit" disabled={authLoading}>
                  {authLoading ? 'Please wait...' : authSubmitText}
                </button>
              </form>
            </section>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell app-shell-dashboard" aria-label="Dashboard">
      <div className="ambient-glow" aria-hidden="true" />

      <section className="dashboard-page">
        <header className="dashboard-nav" aria-label="Primary navigation">
          <div className="dashboard-nav-brand">
            <span className="dashboard-brand-dot" aria-hidden="true" />
            <div>
              <p className="eyebrow">Realtime Chat</p>
              <h1>Control Center</h1>
            </div>
          </div>

          <div className="dashboard-nav-center" role="status" aria-live="polite">
            <span className="nav-chip">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
            <span className={`status-pill ${isLoaded ? 'ready' : ''}`}>
              <span className="status-dot" aria-hidden="true" />
              {statusText}
            </span>
          </div>

          <div className="dashboard-nav-actions">
            <div className="account-chip" title={userEmail || ''}>
              <span className="account-dot" aria-hidden="true" />
              {userEmail}
            </div>
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? 'Sun' : 'Moon'}
            </button>
            <button type="button" className="ghost-button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        {!showChatStage ? (
          <section className="dashboard-grid" aria-label="Dashboard landing">
            <article className="dash-card hero-card">
              <p className="eyebrow">Workspace</p>
              <h2>Open your room and start coordinating instantly</h2>
              <p className="hero-text">Run live chat, synchronized streams, and room moderation from one place.</p>
              <div className="dash-actions">
                <button type="button" className="primary-button" onClick={() => setShowChatStage(true)}>
                  Enter chat
                </button>
                <button type="button" className="ghost-button" onClick={handleReload}>
                  Reload room frame
                </button>
              </div>
            </article>

            <article className="dash-card social-card">
              <div className="social-header">
                <p className="eyebrow">Social Hub</p>
                <div className="social-tabs" role="tablist" aria-label="Social tabs">
                  <button
                    type="button"
                    className={`social-tab ${socialTab === 'notifications' ? 'active' : ''}`}
                    onClick={() => setSocialTab('notifications')}
                  >
                    Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}
                  </button>
                  <button
                    type="button"
                    className={`social-tab ${socialTab === 'friends' ? 'active' : ''}`}
                    onClick={() => setSocialTab('friends')}
                  >
                    Friends
                  </button>
                  <button
                    type="button"
                    className={`social-tab ${socialTab === 'messages' ? 'active' : ''}`}
                    onClick={() => setSocialTab('messages')}
                  >
                    Direct chat
                  </button>
                </div>
              </div>

              {socialError && <p className="social-error">{socialError}</p>}
              {socialLoading && <p className="social-muted">Refreshing social data...</p>}

              {socialTab === 'notifications' && (
                <div className="social-panel">
                  <div className="panel-tools">
                    <button type="button" className="ghost-button" onClick={markNotificationsRead}>
                      Mark all read
                    </button>
                  </div>
                  <div className="feed-list">
                    {notifications.length === 0 ? (
                      <p className="social-muted">No notifications yet.</p>
                    ) : (
                      notifications.map((item) => (
                        <div key={item.id} className={`feed-item ${item.is_read ? '' : 'unread'}`}>
                          <strong>{item.kind.replace('_', ' ')}</strong>
                          <span>{item.payload?.display_name || item.payload?.username || item.payload?.from || 'Activity'}</span>
                          {item.payload?.preview && <span className="feed-preview">{item.payload.preview}</span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {socialTab === 'friends' && (
                <div className="social-panel">
                  <div className="panel-tools search-tools">
                    <input
                      className="auth-input"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleSearchUsers()
                        }
                      }}
                      placeholder="Search users by username"
                    />
                    <button type="button" className="primary-button" onClick={handleSearchUsers}>
                      Search
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="feed-list">
                      {searchResults.map((profile) => (
                        <div key={profile.username} className="feed-item">
                          <div>
                            <strong>{profile.display_name}</strong>
                            <span>{profile.username}</span>
                          </div>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => sendFriendRequest(profile.username)}
                          >
                            Add friend
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="split-lists">
                    <div>
                      <h3>Incoming requests</h3>
                      {incomingRequests.length === 0 ? (
                        <p className="social-muted">No incoming requests.</p>
                      ) : (
                        incomingRequests.map((req) => (
                          <div key={req.id} className="feed-item">
                            <div>
                              <strong>{req.sender_profile?.display_name || req.sender_username}</strong>
                              <span>{req.sender_username}</span>
                            </div>
                            <div className="inline-actions">
                              <button type="button" className="primary-button" onClick={() => respondToRequest(req.id, 'accept')}>
                                Accept
                              </button>
                              <button type="button" className="ghost-button" onClick={() => respondToRequest(req.id, 'reject')}>
                                Reject
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div>
                      <h3>Your friends</h3>
                      {friends.length === 0 ? (
                        <p className="social-muted">No friends yet.</p>
                      ) : (
                        friends.map((friend) => (
                          <div key={friend.username} className="feed-item">
                            <div>
                              <strong>{friend.display_name}</strong>
                              <span>{friend.username}</span>
                            </div>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => {
                                setSocialTab('messages')
                                loadConversation(friend.username)
                              }}
                            >
                              Message
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {socialTab === 'messages' && (
                <div className="social-panel dm-layout">
                  <aside className="dm-sidebar">
                    {conversations.length === 0 ? (
                      <p className="social-muted">Start by adding friends.</p>
                    ) : (
                      conversations.map((convo) => (
                        <button
                          key={convo.friend.username}
                          type="button"
                          className={`dm-thread ${selectedFriend === convo.friend.username ? 'active' : ''}`}
                          onClick={() => loadConversation(convo.friend.username)}
                        >
                          <strong>{convo.friend.display_name}</strong>
                          <span>{convo.last_message?.message || 'No messages yet'}</span>
                          {convo.unread > 0 && <em>{convo.unread} new</em>}
                        </button>
                      ))
                    )}
                  </aside>

                  <div className="dm-main">
                    <div className="dm-messages">
                      {selectedFriend ? (
                        dmMessages.length === 0 ? (
                          <p className="social-muted">No messages yet with this friend.</p>
                        ) : (
                          dmMessages.map((message) => (
                            <div
                              key={message.id}
                              className={`dm-bubble ${message.sender_username === userEmail ? 'mine' : ''}`}
                            >
                              <p>{message.message}</p>
                              <span>{new Date(message.created_at).toLocaleString()}</span>
                            </div>
                          ))
                        )
                      ) : (
                        <p className="social-muted">Select a friend conversation.</p>
                      )}
                    </div>

                    <div className="dm-composer">
                      <input
                        className="auth-input"
                        value={dmInput}
                        onChange={(event) => setDmInput(event.target.value)}
                        placeholder={selectedFriend ? 'Type a direct message...' : 'Select a conversation first'}
                        disabled={!selectedFriend}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            sendDirectMessage()
                          }
                        }}
                      />
                      <button type="button" className="primary-button" disabled={!selectedFriend} onClick={sendDirectMessage}>
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </article>
          </section>
        ) : (
          <section className="chat-stage elevated-stage" aria-label="Chat stage">
            <div className="chat-stage-toolbar">
              <button type="button" className="ghost-button" onClick={() => setShowChatStage(false)}>
                Back to dashboard
              </button>
              <span className={`status-pill ${isLoaded ? 'ready' : ''}`} aria-live="polite">
                <span className="status-dot" aria-hidden="true" />
                {statusText}
              </span>
              <button type="button" className="ghost-button" onClick={handleReload}>
                Reload chat
              </button>
            </div>

            <div className="frame-wrap chat-frame">
              <iframe
                key={frameKey}
                className="legacy-frame"
                src="/legacy.html"
                title="Realtime Chat"
                loading="eager"
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => setIsLoaded(true)}
              />
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default App
