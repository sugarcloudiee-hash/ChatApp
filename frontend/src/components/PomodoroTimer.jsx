import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../SocketContext';

export default function PomodoroTimer({ roomKey }) {
  const socket = useSocket();
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const isSyncingRef = useRef(false);

  // Listen for timer sync from server
  useEffect(() => {
    if (!socket) return;

    const handlePomodoroSync = (data) => {
      if (!data) return;
      
      isSyncingRef.current = true;
      
      // Apply remote timer state
      if (typeof data.time_left === 'number') {
        setTimeLeft(data.time_left);
      }
      if (typeof data.is_active === 'boolean') {
        setIsActive(data.is_active);
      }
      
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 100);
    };

    socket.on('pomodoro_sync', handlePomodoroSync);
    return () => socket.off('pomodoro_sync', handlePomodoroSync);
  }, [socket]);

  // Emit timer state when it changes
  const emitTimerState = (activeState, timeState) => {
    if (!socket || !socket.connected || isSyncingRef.current) return;
    
    socket.emit('pomodoro_sync', {
      time_left: timeState,
      is_active: activeState
    });
  };

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  // Emit timer state periodically while running
  useEffect(() => {
    if (!isActive) return;
    
    const interval = setInterval(() => {
      emitTimerState(isActive, timeLeft);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const toggleTimer = () => {
    const newState = !isActive;
    setIsActive(newState);
    emitTimerState(newState, timeLeft);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(25 * 60);
    emitTimerState(false, 25 * 60);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = ((25 * 60 - timeLeft) / (25 * 60)) * 100;

  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl p-5 text-center">
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-5">
        Shared Focus Timer
      </h4>
      
      {/* Timer Circle */}
      <div className="relative w-32 h-32 mx-auto mb-5">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="4" className="text-border-subtle" />
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            className="text-brand transition-all duration-1000"
            strokeDasharray={`${2 * Math.PI * 42}`}
            strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress / 100)}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-text-main font-mono tracking-tight">
            {formatTime(timeLeft)}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={toggleTimer}
          className="flex-1 bg-brand hover:bg-brand-hover text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-all"
        >
          {isActive ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={resetTimer}
          className="bg-bg-app border border-border-subtle text-text-main hover:bg-bg-app/80 rounded-lg px-3 py-2.5 text-sm transition-all"
        >
          ↻
        </button>
      </div>
    </div>
  );
}