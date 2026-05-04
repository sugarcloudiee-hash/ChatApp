import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { useSocket } from '../SocketContext';

export default function VideoPlayer({ roomKey, currentUser }) {
  const socket = useSocket();
  const playerRef = useRef(null);

  const getPlayerTime = useCallback(() => {
    const player = playerRef.current;
    if (!player) return 0;

    if (typeof player.getCurrentTime === 'function') {
      return player.getCurrentTime();
    }

    if (typeof player.currentTime === 'number') {
      return player.currentTime;
    }

    return 0;
  }, []);

  const seekPlayerToSeconds = useCallback((seconds) => {
    const player = playerRef.current;
    if (!player) return;

    if (typeof player.seekTo === 'function') {
      player.seekTo(seconds, 'seconds');
      return;
    }

    if (typeof player.currentTime === 'number') {
      player.currentTime = seconds;
    }
  }, []);

  const seekPlayerToFraction = useCallback((fraction, totalDuration) => {
    const player = playerRef.current;
    if (!player) return;

    if (typeof player.seekTo === 'function') {
      player.seekTo(fraction, 'fraction');
      return;
    }

    if (typeof player.currentTime === 'number' && totalDuration > 0) {
      player.currentTime = fraction * totalDuration;
    }
  }, []);
  
  const [mediaUrl, setMediaUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [controller, setController] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [seeking, setSeeking] = useState(false);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSyncingFromServer, setIsSyncingFromServer] = useState(false);
  const [syncDrift, setSyncDrift] = useState(null);

  // Listen for sync events from server
  useEffect(() => {
    if (!socket) return;

    const handleSync = (data) => {
      if (!data.source_url) return;
      
      console.log('🎬 Sync received:', data);
      
      // Don't sync if we're the controller
      if (data.updated_by === currentUser?.email) return;
      
      setIsSyncingFromServer(true);
      
      // Load new media if different
      if (data.source_url !== mediaUrl) {
        setMediaUrl(data.source_url);
      }
      
      setController(data.updated_by);
      
      // Sync playback state
      setPlaying(data.playing);
      
      // Seek to position if difference > 1 second
      if (playerRef.current && data.position !== undefined) {
        const currentTime = getPlayerTime();
        const diff = Math.abs(currentTime - data.position);
        
        if (diff > 1) {
          seekPlayerToSeconds(data.position);
          setSyncDrift(diff.toFixed(1));
          setTimeout(() => setSyncDrift(null), 3000);
        }
      }
      
      if (data.playbackRate) setPlaybackRate(data.playbackRate);
      if (data.volume !== undefined) setVolume(data.volume);
      
      setTimeout(() => setIsSyncingFromServer(false), 500);
    };

    socket.on('video_sync_state', handleSync);
    return () => socket.off('video_sync_state', handleSync);
  }, [socket, currentUser, mediaUrl, getPlayerTime, seekPlayerToSeconds]);

  // Emit state to partner
  const emitState = useCallback((newPlaying, position = null) => {
    if (!socket || !mediaUrl || isSyncingFromServer) return;
    
    const state = {
      source_url: mediaUrl,
      playing: newPlaying,
      position: position !== null ? position : getPlayerTime(),
      playbackRate: playbackRate,
      volume: volume,
      updated_by: currentUser?.email
    };
    
    socket.emit('video_sync_state', state);
  }, [socket, mediaUrl, isSyncingFromServer, currentUser, playbackRate, volume, getPlayerTime]);

  // Load media from URL
  const handleLoadMedia = (e) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    
    setMediaUrl(url);
    setController(currentUser?.email);
    setPlaying(true);
    
    if (socket) {
      socket.emit('video_sync_state', {
        source_url: url,
        playing: true,
        position: 0,
        playbackRate: 1,
        volume: 1,
        updated_by: currentUser?.email
      });
    }
    
    setUrlInput('');
  };

  // Player event handlers
  const handlePlay = () => {
    setPlaying(true);
    emitState(true);
  };

  const handlePause = () => {
    setPlaying(false);
    emitState(false);
  };

  const handleSeekChange = (e) => {
    setPlayed(parseFloat(e.target.value));
  };

  const handleSeekMouseDown = () => {
    setSeeking(true);
  };

  const handleSeekMouseUp = (e) => {
    setSeeking(false);
    const newPosition = parseFloat(e.target.value);
    seekPlayerToFraction(newPosition, duration);
    emitState(playing, newPosition * duration);
  };

  const handleTimeUpdate = (event) => {
    if (seeking) return;
    const currentTime = event?.currentTarget?.currentTime ?? getPlayerTime();
    const currentDuration = event?.currentTarget?.duration ?? duration;
    if (currentDuration > 0) {
      setPlayed(currentTime / currentDuration);
    }
  };

  const handleDurationChange = (event) => {
    const nextDuration = event?.currentTarget?.duration;
    if (typeof nextDuration === 'number' && !Number.isNaN(nextDuration)) {
      setDuration(nextDuration);
    }
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    emitState(playing);
  };

  const handlePlaybackRateChange = (rate) => {
    setPlaybackRate(rate);
    emitState(playing);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Sync periodic position update every 5 seconds
  useEffect(() => {
    if (!playing || isSyncingFromServer || controller !== currentUser?.email) return;
    
    const interval = setInterval(() => {
      if (playerRef.current) {
        emitState(playing, getPlayerTime());
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [playing, isSyncingFromServer, controller, currentUser, emitState, getPlayerTime]);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-panel/90 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${socket?.connected ? 'bg-sync-green' : 'bg-error-red'} animate-pulse`} />
          <span className="text-xs text-text-muted">
            {socket?.connected ? 'Connected' : 'Disconnected'}
          </span>
          {syncDrift && (
            <span className="text-xs text-warn-amber">Resyncing ({syncDrift}s drift)</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {controller && (
            <span className="text-xs text-text-muted">
              Controller: <span className="text-brand font-medium">{controller === currentUser?.email ? 'You' : controller?.split('@')[0]}</span>
            </span>
          )}
          {controller === currentUser?.email && (
            <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-medium">You're driving</span>
          )}
        </div>
      </div>

      {/* Player Area */}
      <div className="flex-1 flex items-center justify-center bg-black min-h-0">
        {!mediaUrl ? (
          <form onSubmit={handleLoadMedia} className="bg-bg-panel/95 backdrop-blur-sm p-8 rounded-xl border border-border-subtle w-full max-w-md mx-4">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l5 5-5 5M5 20V4l10 8-10 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white text-center mb-1">Load Media</h3>
            <p className="text-text-muted text-sm text-center mb-5">
              Paste a YouTube, Google Drive, or direct video link to sync with your partner
            </p>
            <div className="space-y-3">
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="Paste link here..."
                className="w-full bg-bg-card border border-border-subtle text-text-main rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
              />
              <button type="submit" className="w-full bg-brand hover:bg-brand-hover text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all">
                Load & Sync
              </button>
            </div>
            <div className="mt-4 flex gap-2 text-xs text-text-muted justify-center">
              <span>🎬 YouTube</span>
              <span>•</span>
              <span>📁 Google Drive</span>
              <span>•</span>
              <span>🎵 Audio</span>
              <span>•</span>
              <span>📺 Direct URL</span>
            </div>
          </form>
        ) : (
          <div className="relative w-full h-full">
            <ReactPlayer
              ref={playerRef}
              src={mediaUrl}
              playing={playing}
              volume={volume}
              playbackRate={playbackRate}
              onPlay={handlePlay}
              onPause={handlePause}
              onTimeUpdate={handleTimeUpdate}
              onDurationChange={handleDurationChange}
              width="100%"
              height="100%"
              controls={false}
              config={{
                youtube: {
                  playerVars: {
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    iv_load_policy: 3,
                  }
                },
                file: {
                  attributes: {
                    controlsList: 'nodownload',
                    crossOrigin: 'anonymous',
                  }
                }
              }}
              style={{ position: 'absolute', top: 0, left: 0 }}
            />
          </div>
        )}
      </div>

      {/* Custom Controls */}
      {mediaUrl && (
        <div className="bg-bg-panel/95 border-t border-border-subtle px-4 py-3 space-y-2">
          {/* Seek Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted w-10 text-right">{formatTime(played * duration)}</span>
            <input
              type="range"
              min={0}
              max={0.999999}
              step="any"
              value={played}
              onMouseDown={handleSeekMouseDown}
              onChange={handleSeekChange}
              onMouseUp={handleSeekMouseUp}
              className="flex-1 h-1 bg-border-subtle rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:rounded-full"
            />
            <span className="text-xs text-text-muted w-10">{formatTime(duration)}</span>
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Play/Pause */}
              <button
                onClick={() => {
                  setPlaying(!playing);
                  if (playing) {
                    emitState(false);
                  } else {
                    emitState(true);
                  }
                }}
                className="text-white hover:text-brand transition-colors p-1"
                title={playing ? 'Pause' : 'Play'}
              >
                {playing ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4 text-text-muted" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                </svg>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-border-subtle rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Speed Control */}
              <select
                value={playbackRate}
                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                className="bg-bg-card border border-border-subtle text-text-main rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-brand"
              >
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>

              {/* Fullscreen */}
              <button
                onClick={() => {
                  const container = document.querySelector('.player-wrapper');
                  if (container?.requestFullscreen) {
                    container.requestFullscreen();
                  }
                }}
                className="text-text-muted hover:text-white transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}