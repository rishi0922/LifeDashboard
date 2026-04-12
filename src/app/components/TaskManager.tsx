"use client";

import { useState, useEffect } from "react";

type Task = { id: string; title: string; category: string; status: string };

export function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Work");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories = [
    { name: 'Urgent', icon: '⚡' },
    { name: 'Work', icon: '💼' },
    { name: 'Personal', icon: '🏠' }
  ];

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error(`Status ${res.status}: Failed to fetch tasks`, errorData);
        return;
      }
      const data = await res.json();
      if (data.tasks) setTasks(data.tasks);
    } catch(e) {
      console.error("Network or parsing error fetching tasks:", e);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, category: newCategory })
      });
      if (res.ok) {
        setNewTitle("");
        setIsFormOpen(false);
        fetchTasks();
        window.dispatchEvent(new Event('refreshGamification'));
      }
    } catch (e) {
      console.error("Failed to add task", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGmailSync = () => {
    // Notify the AI Chat to perform a scan
    window.dispatchEvent(new CustomEvent('brainDump', { 
      detail: "Please scan my Gmail inbox for any urgent tasks or deadlines and suggest what I should add." 
    }));
  };

  useEffect(() => {
    fetchTasks();
    window.addEventListener('refreshTasks', fetchTasks);
    return () => window.removeEventListener('refreshTasks', fetchTasks);
  }, []);

  const toggleTask = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'TODO' ? 'DONE' : 'TODO';
    
    // Optimistic UI updates
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
    
    // Server Mutation
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      });
      window.dispatchEvent(new Event('refreshGamification'));
    } catch(e) {
      fetchTasks();
    }
  };

  const deleteTask = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setTasks(prev => prev.filter(t => t.id !== id));
      window.dispatchEvent(new Event('refreshGamification'));
    } catch(e) {
      console.error("Failed to delete task", e);
    }
  };

  return (
    <div className="glass-panel" style={{ height: '90vh', minHeight: '800px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          ✅ Priorities
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={handleGmailSync}
            title="Manual Scout Scan"
            className="btn-icon" 
            style={{ 
              background: 'rgba(234, 67, 53, 0.1)', 
              color: '#ea4335', 
              border: '1px solid rgba(234, 67, 53, 0.2)',
              fontSize: '1rem'
            }}
          >
            📧
          </button>
          <button 
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="btn-icon" 
            style={{ 
              background: isFormOpen ? 'var(--text-secondary)' : 'var(--accent-color)', 
              color: '#fff', 
              border: 'none',
              transform: isFormOpen ? 'rotate(45deg)' : 'none',
              transition: 'all 0.3s ease'
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Manual Add Form */}
      {isFormOpen && (
        <form 
          onSubmit={handleAddTask} 
          className="animate-slide-down"
          style={{ 
            background: 'var(--bg-secondary)', 
            padding: '1.25rem', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '2rem',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }}
        >
          <input 
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="What needs to be done?"
            style={{ 
              width: '100%', 
              padding: '0.75rem', 
              background: 'var(--bg-primary)', 
              border: '1px solid var(--border-color)', 
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              marginBottom: '1rem',
              outline: 'none',
              fontSize: '0.9rem'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {categories.map(cat => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setNewCategory(cat.name)}
                  style={{ 
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor: newCategory === cat.name ? 'var(--accent-color)' : 'var(--border-color)',
                    background: newCategory === cat.name ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    color: newCategory === cat.name ? 'var(--accent-color)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
            <button 
              type="submit" 
              disabled={isSubmitting || !newTitle.trim()}
              className="btn-primary"
              style={{ padding: '0.5rem 1.25rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}
            >
              {isSubmitting ? '...' : 'Add Priority'}
            </button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto', flex: 1, paddingRight: '0.4rem' }}>
        {categories.map(cat => {
          const categoryTasks = tasks.filter(t => t.category === cat.name);
          return (
            <div key={cat.name}>
              <h3 style={{ 
                fontSize: '0.75rem', 
                textTransform: 'uppercase', 
                letterSpacing: '0.08em', 
                color: 'var(--text-secondary)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                {cat.icon} {cat.name} <span style={{ background: 'var(--border-color)', padding: '0.05rem 0.4rem', borderRadius: '8px', fontSize: '0.65rem' }}>{categoryTasks.length}</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {categoryTasks.map((task: any, index) => (
                  <label key={task.id} className="animate-fade-in" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: task.status === 'DONE' ? 'transparent' : (task.isAiGenerated ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, var(--bg-secondary) 100%)' : 'var(--bg-secondary)'),
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor: task.status === 'DONE' ? 'transparent' : (task.isAiGenerated ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-color)'),
                    opacity: task.status === 'DONE' ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                    position: 'relative',
                    boxShadow: task.status === 'DONE' ? 'none' : (task.isAiGenerated ? '0 2px 10px rgba(99, 102, 241, 0.08)' : '0 1px 4px rgba(0,0,0,0.01)'),
                    animationDelay: `${index * 30}ms`,
                  }}>
                    <input 
                      type="checkbox" 
                      checked={task.status === 'DONE'}
                      onChange={() => toggleTask(task.id, task.status)}
                      style={{ 
                        width: '18px', 
                        height: '18px', 
                        accentColor: 'var(--success-color)', 
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ 
                          fontWeight: 500,
                          fontSize: '0.9rem',
                          color: 'var(--text-primary)',
                          textDecoration: task.status === 'DONE' ? 'line-through' : 'none',
                          lineHeight: 1.2
                        }}>
                          {task.title}
                        </span>
                        {task.isAiGenerated && (
                          <span style={{ 
                            fontSize: '0.65rem', 
                            background: 'rgba(99, 102, 241, 0.12)', 
                            color: 'var(--accent-color)',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontWeight: 700
                          }}>
                            ✨
                          </span>
                        )}
                      </div>
                    </div>

                    {task.isAiGenerated && (
                      <button 
                        onClick={(e) => deleteTask(task.id, e)}
                        className="btn-icon"
                        title="Dismiss"
                        style={{ 
                          background: 'transparent',
                          color: '#ef4444', 
                          border: 'none',
                          padding: '0.15rem',
                          fontSize: '0.8rem',
                          opacity: 0.5
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </label>
                ))}
                {categoryTasks.length === 0 && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic', padding: '0.5rem' }}>
                    Nothing pending. Awesome!
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
