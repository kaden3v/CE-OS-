import React, { useId, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { CheckCircle2, Circle, X, Clock } from 'lucide-react';
import { Input } from './Input';

interface TasksPanelProps {
  open: boolean;
  onClose: () => void;
}

export function TasksPanel({ open, onClose }: TasksPanelProps) {
  const { tasks, toggleTask, addTask, deleteTask } = useApp();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const titleId = useId();
  
  if (!open) return null;

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    addTask({
      title: newTaskTitle,
      due: "No date",
      type: "general"
    });
    setNewTaskTitle('');
  };

  const pendingTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  return (
    <div
      className="absolute top-[46px] right-0 w-[360px] bg-bg-base/90 backdrop-blur-md border border-border-subtle rounded-xl shadow-2xl z-50 flex flex-col max-h-[calc(100vh-80px)] overflow-hidden"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="p-4 border-b border-border-subtle flex items-center justify-between shrink-0">
        <h3 id={titleId} className="font-medium text-text-primary">Tasks</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tasks panel"
          className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <form onSubmit={handleAddTask} className="flex gap-2 relative" aria-label="Add task">
          <Input 
            autoFocus
            label="New task title"
            hideLabel
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Add a new task..."
            className="w-full text-sm"
          />
        </form>

        <div className="space-y-1" role="list" aria-label="Pending tasks">
          {pendingTasks.length === 0 && (
            <div className="text-center py-8 text-sm text-text-tertiary">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
              All caught up!
            </div>
          )}
          {pendingTasks.map(task => (
            <div key={task.id} role="listitem" className="group flex items-start gap-3 p-2 hover:bg-bg-hover rounded-lg transition-colors">
              <button 
                type="button"
                onClick={() => toggleTask(task.id)}
                aria-label={`Mark ${task.title} as completed`}
                aria-pressed={task.completed}
                className="mt-1 flex-shrink-0 text-text-secondary hover:text-status-ok transition-colors"
                title="Mark as completed"
              >
                <Circle className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{task.title}</p>
                {task.due !== "No date" && (
                  <p className="text-xs text-text-tertiary mt-1 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {task.due} &middot; {task.type}
                  </p>
                )}
              </div>
              <button 
                type="button"
                onClick={() => deleteTask(task.id)}
                aria-label={`Delete ${task.title}`}
                className="mt-1 p-1 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-status-alert hover:bg-status-alert/10 rounded transition-all focus:opacity-100"
                title="Delete task"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {completedTasks.length > 0 && (
          <div className="space-y-1 pt-4 border-t border-border-subtle">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2 px-2">Completed</h4>
            <div role="list" aria-label="Completed tasks">
              {completedTasks.map(task => (
                <div key={task.id} role="listitem" className="group flex items-start gap-3 p-2 hover:bg-bg-hover rounded-lg transition-colors opacity-60 hover:opacity-100">
                <button 
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  aria-label={`Mark ${task.title} as pending`}
                  aria-pressed={task.completed}
                  className="mt-1 flex-shrink-0 text-status-ok"
                  title="Mark as pending"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-secondary line-through decoration-text-tertiary">{task.title}</p>
                </div>
                <button 
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  aria-label={`Delete ${task.title}`}
                  className="mt-1 p-1 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-status-alert hover:bg-status-alert/10 rounded transition-all focus:opacity-100"
                  title="Delete task"
                >
                  <X className="w-3 h-3" />
                </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
