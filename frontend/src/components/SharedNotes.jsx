import React, { useState, useEffect } from 'react';
import { useSocket } from '../SocketContext';

export default function SharedNotes({ roomKey }) {
  const socket = useSocket();
  const [text, setText] = useState('');

  useEffect(() => {
    if (!socket) return;
    socket.on('sync_notes', (data) => setText(data.text));
    return () => socket.off('sync_notes');
  }, [socket]);

  const handleChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    if (socket) socket.emit('sync_notes', { room_key: roomKey, text: newText });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold text-text-main">Live Notes</h4>
        <span className="text-[10px] text-sync-green font-medium">Synced</span>
      </div>
      <textarea
        value={text}
        onChange={handleChange}
        placeholder="Shared scratchpad... type here to sync with your partner."
        className="w-full h-40 bg-bg-app border border-border-subtle text-text-main rounded-lg p-3 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all resize-none placeholder:text-text-muted/50 scrollbar-thin"
      />
    </div>
  );
}