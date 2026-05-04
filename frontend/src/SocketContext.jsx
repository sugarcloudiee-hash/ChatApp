import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, token }) => {
  const [socket, setSocket] = useState(null);
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5050';

  useEffect(() => {
    if (!token) return;

    const newSocket = io(apiBaseUrl, {
      auth: { token: token },
      // Polling-first is more reliable in this app; websocket upgrades automatically.
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket Connected:', newSocket.id);
    });

    newSocket.on('connected', (data) => {
      console.log('✅ Server confirmed:', data.message);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Socket Disconnected:', reason);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
    });

    setSocket(newSocket);

    return () => {
      console.log('Cleaning up socket...');
      newSocket.disconnect();
    };
  }, [token, apiBaseUrl]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};