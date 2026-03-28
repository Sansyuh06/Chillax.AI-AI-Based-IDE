import React from 'react';
import { X, User, Shield, Terminal, Settings2 } from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  models,
  activeModel,
  onModelChange,
  experienceLevel,
  onExperienceChange,
}) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel animate-fade-in-scale" style={{
        width: 600, maxWidth: '90vw', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: 16, border: '1px solid var(--border-highlight)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}>
        <div className="panel-header" style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-primary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600 }}>
            <Settings2 size={18} /> IDE Settings
          </span>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="panel-body" style={{ padding: 24, display: 'flex', gap: 24, overflowY: 'auto' }}>
          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 160 }}>
            <button className="btn btn-ghost active" style={{ justifyContent: 'flex-start' }}><User size={14} /> AI Engine</button>
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}><Terminal size={14} /> Editor</button>
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}><Shield size={14} /> Privacy (Offline)</button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* AI Experience */}
            <div>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                Developer Profile
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Experience Level</span>
                  <select 
                    value={experienceLevel} 
                    onChange={(e) => onExperienceChange(e.target.value)}
                    style={{ 
                      background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)', padding: '6px 12px', borderRadius: 8
                    }}
                  >
                    <option value="Junior">Junior (Explain thoroughly)</option>
                    <option value="Mid">Mid (Standard)</option>
                    <option value="Senior">Senior (Concise & Arch focus)</option>
                  </select>
                </label>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  This adjusts the system prompt for code explanations and project queries.
                </div>
              </div>
            </div>

            {/* Offline Model */}
            <div>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                Ollama Runtime
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Local LLM</span>
                  <select 
                    value={activeModel} 
                    onChange={(e) => onModelChange(e.target.value)}
                    style={{ 
                      background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)', padding: '6px 12px', borderRadius: 8
                    }}
                  >
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Models are executed 100% locally. No data leaves your machine.
                </div>
              </div>
            </div>

          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>Save & Close</button>
        </div>
      </div>
    </div>
  );
}
