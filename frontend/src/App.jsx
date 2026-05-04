import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SocketProvider, useSocket } from './SocketContext';
import ChatPanel from './components/ChatPanel';
import PomodoroTimer from './components/PomodoroTimer';
import VideoPlayer from './components/VideoPlayer';
import SharedNotes from './components/SharedNotes';
import TaskBoard from './components/TaskBoard';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============== AUTH VIEW ==============
function AuthView() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { display_name: displayName || email.split('@')[0] } }
        });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen">
      {/* Hero Section */}
      <div className="flex-1 bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col justify-center px-16 border-r border-border-subtle relative overflow-hidden">
        <div className="absolute top-[-200px] left-[-100px] w-[600px] h-[600px] bg-brand/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-100px] w-[500px] h-[500px] bg-sync-green/5 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">SyncSpace</span>
          </div>
          
          <h1 className="text-6xl font-bold text-white mb-6 leading-tight">
            Sync.<br/>Study.<br/>Connect.
          </h1>
          <p className="text-lg text-text-muted leading-relaxed max-w-md">
            A private, real-time 2-person room designed for seamless media synchronization and focused productivity.
          </p>
        </div>
      </div>

      {/* Form Section */}
      <div className="flex-1 flex items-center justify-center bg-bg-app p-8">
        <div className="w-full max-w-md">
          <div className="bg-bg-panel rounded-2xl p-8 shadow-2xl border border-border-subtle">
            <h2 className="text-3xl font-bold text-white mb-2">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-text-muted mb-8 text-sm">
              {isLogin ? 'Enter your credentials to access your workspace.' : 'Start your journey with a free account.'}
            </p>

            {error && (
              <div className="bg-error-red/10 border border-error-red/30 text-error-red px-4 py-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-bg-card border border-border-subtle text-text-main rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  placeholder="you@example.com"
                />
              </div>
              
              {!isLogin && (
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full bg-bg-card border border-border-subtle text-text-main rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                    placeholder="How should we call you?"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-bg-card border border-border-subtle text-text-main rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand hover:bg-brand-hover text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </span>
                ) : (isLogin ? 'Sign In' : 'Create Account')}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => { setIsLogin(!isLogin); setError(null); }}
                className="text-text-muted hover:text-text-main text-sm transition-colors"
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== DASHBOARD VIEW ==============
function DashboardView({ onJoinRoom, onLogout, user }) {
  const [roomKey, setRoomKey] = useState('');
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [activeTab, setActiveTab] = useState('join');

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const session = await supabase.auth.getSession();
      if (!session?.data?.session) return;
      
      const response = await fetch('http://localhost:5050/api/rooms', {
        headers: {
          'Authorization': `Bearer ${session.data.session.access_token}`
        }
      });
      const data = await response.json();
      if (response.ok) setRooms(data);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    const key = roomKey.trim() || `room-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
    
    try {
      const session = await supabase.auth.getSession();
      if (!session?.data?.session) {
        setMessage('❌ Authentication error. Please sign in again.');
        setLoading(false);
        return;
      }
      
      const response = await fetch('http://localhost:5050/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify({ room_key: key })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage(`✅ Room "${key}" created successfully!`);
        setInviteLink(`http://localhost:5173?room=${key}`);
        fetchRooms();
      } else if (response.status === 409) {
        setMessage(`ℹ️ Room "${key}" already exists. You can join it.`);
        setInviteLink(`http://localhost:5173?room=${key}`);
      } else {
        setMessage(`❌ ${data.error || 'Failed to create room'}`);
      }
    } catch (err) {
      setMessage('❌ Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomKey.trim()) return;
    
    setLoading(true);
    setMessage('');
    
    try {
      const session = await supabase.auth.getSession();
      if (!session?.data?.session) {
        setMessage('❌ Authentication error. Please sign in again.');
        setLoading(false);
        return;
      }

      const response = await fetch(`http://localhost:5050/api/rooms/${roomKey.trim()}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.data.session.access_token}`
        }
      });
      
      if (response.ok) {
        onJoinRoom(roomKey.trim());
      } else {
        const data = await response.json();
        setMessage(`❌ ${data.error || 'Failed to join room'}`);
      }
    } catch (err) {
      setMessage('❌ Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setMessage('📋 Invite link copied to clipboard!');
  };

  return (
    <div className="h-screen flex flex-col p-8 overflow-y-auto">
      {/* Header */}
      <header className="flex justify-between items-end mb-8 pb-6 border-b border-border-subtle">
        <div>
          <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Dashboard</p>
          <h1 className="text-3xl font-bold text-white">
            Welcome, {user?.email?.split('@')[0]}
          </h1>
        </div>
        <button
          onClick={onLogout}
          className="text-text-muted hover:text-error-red border border-border-subtle hover:border-error-red/50 px-5 py-2.5 rounded-lg text-sm transition-all"
        >
          Sign Out
        </button>
      </header>

      {/* Message */}
      {message && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${
          message.startsWith('✅') ? 'bg-sync-green/10 text-sync-green border border-sync-green/30' :
          message.startsWith('📋') ? 'bg-brand/10 text-brand border border-brand/30' :
          message.startsWith('ℹ️') ? 'bg-warn-amber/10 text-warn-amber border border-warn-amber/30' :
          'bg-error-red/10 text-error-red border border-error-red/30'
        }`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => { setActiveTab('join'); setMessage(''); }}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'join' 
                  ? 'bg-brand text-white' 
                  : 'bg-bg-card border border-border-subtle text-text-muted hover:text-text-main'
              }`}
            >
              Join Room
            </button>
            <button
              onClick={() => { setActiveTab('create'); setMessage(''); }}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'create' 
                  ? 'bg-brand text-white' 
                  : 'bg-bg-card border border-border-subtle text-text-muted hover:text-text-main'
              }`}
            >
              Create Room
            </button>
          </div>

          {activeTab === 'join' ? (
            <div className="bg-bg-panel border border-border-subtle rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Join a Room</h3>
              <p className="text-text-muted text-sm mb-4">Enter a room key shared by your study partner.</p>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <input
                  value={roomKey}
                  onChange={e => setRoomKey(e.target.value)}
                  placeholder="Enter room key..."
                  className="w-full bg-bg-card border border-border-subtle text-text-main rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand transition-all"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand hover:bg-brand-hover text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all disabled:opacity-50"
                >
                  {loading ? 'Joining...' : 'Join Room'}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-bg-panel border border-border-subtle rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Create a New Room</h3>
              <p className="text-text-muted text-sm mb-4">Create a room and share the invite link with your partner.</p>
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <input
                  value={roomKey}
                  onChange={e => setRoomKey(e.target.value)}
                  placeholder="Room key (e.g., study-session-1)"
                  className="w-full bg-bg-card border border-border-subtle text-text-main rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand transition-all"
                />
                <p className="text-xs text-text-muted">Leave empty for auto-generated key</p>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand hover:bg-brand-hover text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Room'}
                </button>
              </form>

              {inviteLink && (
                <div className="mt-6 p-4 bg-bg-card rounded-lg border border-brand/30">
                  <p className="text-sm text-text-muted mb-2">Share this link with your partner:</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteLink}
                      className="flex-1 bg-bg-app border border-border-subtle text-text-main rounded-lg px-3 py-2 text-xs"
                    />
                    <button
                      onClick={copyInviteLink}
                      className="bg-brand hover:bg-brand-hover text-white rounded-lg px-4 py-2 text-xs font-medium transition-all whitespace-nowrap"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent Rooms */}
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
              Your Rooms ({rooms.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rooms.map(room => (
                <div
                  key={room.room_key}
                  onClick={() => onJoinRoom(room.room_key)}
                  className="bg-bg-panel border border-border-subtle rounded-xl p-5 hover:border-brand/50 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-white truncate">{room.room_key}</span>
                    <span className="text-xs bg-sync-green/10 text-sync-green px-2 py-1 rounded-full">
                      {room.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-muted">
                    <span>Host: {room.host_username}</span>
                    <span>Members: {room.member_count || 1}/2</span>
                  </div>
                </div>
              ))}
              {rooms.length === 0 && (
                <p className="text-text-muted text-sm col-span-2 py-8 text-center">
                  No rooms yet. Create or join one!
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Tips */}
        <div className="space-y-6">
          <div className="bg-bg-panel border border-border-subtle rounded-xl p-6">
            <h4 className="text-sm font-semibold text-white mb-4">How it works</h4>
            <ul className="space-y-3 text-sm text-text-muted">
              <li className="flex gap-3">
                <span className="text-lg">🔑</span>
                <span>Create a room to get started</span>
              </li>
              <li className="flex gap-3">
                <span className="text-lg">🔗</span>
                <span>Share the invite link with your partner</span>
              </li>
              <li className="flex gap-3">
                <span className="text-lg">🎥</span>
                <span>Watch videos together in sync</span>
              </li>
              <li className="flex gap-3">
                <span className="text-lg">💬</span>
                <span>Chat and collaborate in real-time</span>
              </li>
              <li className="flex gap-3">
                <span className="text-lg">⏱️</span>
                <span>Use the focus timer for study sessions</span>
              </li>
              <li className="flex gap-3">
                <span className="text-lg">📝</span>
                <span>Take shared notes together</span>
              </li>
            </ul>
          </div>

          <div className="bg-bg-panel border border-border-subtle rounded-xl p-6">
            <h4 className="text-sm font-semibold text-white mb-4">Room Status</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-text-muted text-sm">Server</span>
                <span className="text-sync-green text-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-sync-green rounded-full" />
                  Online
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-muted text-sm">Your Rooms</span>
                <span className="text-white text-sm font-semibold">{rooms.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== STUDY ROOM VIEW ==============
function StudyRoomView({ roomKey, onLeave, user }) {
  const socket = useSocket();
  const [isStudyMode, setIsStudyMode] = useState(true);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      socket.emit('join_room', { room_key: roomKey });
    };

    const handleRoomState = (data) => {
      setMembers(data.members || []);
    };

    const handleUserJoined = (data) => {
      setMembers(prev => [...prev, data]);
    };

    const handleUserLeft = (data) => {
      setMembers(prev => prev.filter(m => m.username !== data.username));
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on('connect', handleConnect);
    socket.on('room_state', handleRoomState);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);

    return () => {
      socket.emit('leave_room');
      socket.off('connect', handleConnect);
      socket.off('room_state', handleRoomState);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
    };
  }, [socket, roomKey]);

  const getDisplayName = (username) => {
    if (username === user?.email) return 'You';
    return members.find(m => m.username === username)?.display_name || username;
  };

  return (
    <div className="grid grid-cols-[280px_1fr_320px] grid-rows-[56px_1fr] h-screen w-screen">
      {/* Top Bar */}
      <header className="col-span-3 bg-bg-panel border-b border-border-subtle flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-semibold text-white">{roomKey}</h2>
          <div className="flex items-center gap-2 bg-sync-green/10 text-sync-green px-3 py-1 rounded-full text-xs font-semibold">
            <div className="w-2 h-2 rounded-full bg-sync-green animate-pulse"/>
            {members.length > 0 ? `${members.length} online` : 'Online'}
          </div>
          {members.length > 0 && (
            <div className="flex -space-x-2">
              {members.slice(0, 2).map(m => (
                <div key={m.username} className="w-7 h-7 rounded-full bg-brand flex items-center justify-center border-2 border-bg-panel" title={m.display_name}>
                  <span className="text-[10px] font-bold text-white uppercase">
                    {m.display_name?.[0] || '?'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsStudyMode(!isStudyMode)}
            className="bg-bg-card border border-border-subtle text-text-main hover:bg-bg-card/80 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
          >
            <span>{isStudyMode ? '🎯' : '🎉'}</span>
            {isStudyMode ? 'Study Mode' : 'Fun Mode'}
          </button>
          <button
            onClick={onLeave}
            className="text-text-muted hover:text-error-red border border-border-subtle hover:border-error-red/50 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          >
            Leave Room
          </button>
        </div>
      </header>

      {/* Left Sidebar */}
      <aside className="bg-bg-panel border-r border-border-subtle flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-border-subtle">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Workspace</h3>
        </div>
        <TaskBoard roomKey={roomKey} />
        <div className="p-5 mt-auto border-t border-border-subtle">
          <button className="w-full bg-bg-card border border-border-subtle text-text-main hover:bg-bg-card/80 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Connect Google Drive
          </button>
        </div>
      </aside>

      {/* Center Stage */}
      <main className="flex flex-col bg-bg-app overflow-hidden">
        <div className="flex-[2] border-b border-border-subtle min-h-0">
          <VideoPlayer roomKey={roomKey} currentUser={user} />
        </div>
        <div className="flex-1 min-h-0">
          <ChatPanel roomKey={roomKey} currentUser={user} />
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className="bg-bg-panel border-l border-border-subtle flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-border-subtle">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Study Tools</h3>
        </div>
        <div className="p-5 space-y-6">
          <PomodoroTimer roomKey={roomKey} />
          <SharedNotes roomKey={roomKey} />
        </div>
      </aside>
    </div>
  );
}

// ============== ROOT APP ==============
export default function App() {
  const [session, setSession] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Check for room in URL
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setCurrentRoom(roomFromUrl);
    }

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-app">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-6 w-6 text-brand" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-text-muted text-sm">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (!session) return <AuthView />;

  if (!currentRoom) {
    return (
      <DashboardView
        user={session.user}
        onJoinRoom={setCurrentRoom}
        onLogout={() => supabase.auth.signOut()}
      />
    );
  }

  return (
    <SocketProvider token={session.access_token}>
      <StudyRoomView
        roomKey={currentRoom}
        onLeave={() => {
          setCurrentRoom(null);
          window.history.replaceState({}, '', '/');
        }}
        user={session.user}
      />
    </SocketProvider>
  );
}