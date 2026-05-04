import React, { useState, useEffect } from 'react';
import { useSocket } from '../SocketContext';

export default function TaskBoard({ roomKey }) {
  const socket = useSocket();
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');

  useEffect(() => {
    if (!socket) return;
    socket.on('sync_tasks', (syncedTasks) => setTasks(syncedTasks));
    return () => socket.off('sync_tasks');
  }, [socket]);

  const broadcastTasks = (updatedTasks) => {
    setTasks(updatedTasks);
    if (socket) socket.emit('sync_tasks', { room_key: roomKey, tasks: updatedTasks });
  };

  const addTask = (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    const updatedTasks = [...tasks, { id: Date.now(), text: newTask, done: false }];
    broadcastTasks(updatedTasks);
    setNewTask('');
  };

  const toggleTask = (id) => {
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
    broadcastTasks(updatedTasks);
  };

  return (
    <div className="p-5">
      <h4 className="text-sm font-semibold text-text-main mb-4">Session Tasks</h4>

      <form onSubmit={addTask} className="flex gap-2 mb-4">
        <input
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          placeholder="New task..."
          className="flex-1 bg-bg-app border border-border-subtle text-text-main rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-all placeholder:text-text-muted/50"
        />
        <button type="submit" className="bg-brand hover:bg-brand-hover text-white rounded-lg px-3 py-2 text-xs font-semibold transition-all">
          Add
        </button>
      </form>

      <div className="space-y-2">
        {tasks.map(task => (
          <div
            key={task.id}
            className="flex items-center gap-3 bg-bg-app border border-border-subtle rounded-lg p-3 hover:border-border-subtle/80 transition-all cursor-pointer"
          >
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleTask(task.id)}
              className="w-4 h-4 rounded border-border-subtle bg-bg-card text-brand focus:ring-brand focus:ring-2 cursor-pointer"
            />
            <span className={`text-sm ${task.done ? 'line-through text-text-muted/50' : 'text-text-main'}`}>
              {task.text}
            </span>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-text-muted text-xs text-center py-4">No tasks yet.</p>
        )}
      </div>
    </div>
  );
}