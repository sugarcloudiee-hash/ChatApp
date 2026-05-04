import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../SocketContext';

export default function ChatPanel({ roomKey, currentUser }) {
  const socket = useSocket();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (msg) => {
      console.log('📩 Message received:', msg);
      setMessages((prev) => [...prev, msg]);
    };

    const handleSocketError = (err) => {
      console.error('Socket error:', err);
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('error', handleSocketError);
    
    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('error', handleSocketError);
    };
  }, [socket]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !socket?.connected) return;
    
    console.log('📤 Sending message:', inputValue);
    socket.emit('send_message', { room_key: roomKey, message: inputValue });
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="px-5 py-3 border-b border-border-subtle flex justify-between items-center">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Room Chat</span>
        <button className="text-xs text-brand hover:text-brand-hover transition-colors font-medium">
          + Smart Link
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 px-5 py-4 overflow-y-auto scrollbar-thin space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-muted text-xs text-center">
              No messages yet.<br/>Start the conversation!
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className="flex gap-3 group">
              <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white uppercase">
                  {msg.display_name ? msg.display_name[0] : '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm text-text-main">{msg.display_name}</span>
                  <span className="text-[10px] text-text-muted">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <p className="text-sm text-text-main/90 mt-0.5 leading-relaxed break-words">
                  {msg.message}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-border-subtle">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={socket?.connected ? "Type a message..." : "Connecting chat..."}
          disabled={!socket?.connected}
          className="w-full bg-bg-card border border-border-subtle text-text-main rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all placeholder:text-text-muted/50"
        />
      </form>
    </div>
  );
}