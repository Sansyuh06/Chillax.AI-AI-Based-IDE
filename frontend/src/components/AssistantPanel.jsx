import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Cpu, ChevronDown, Check, Reply } from 'lucide-react';

export default function AssistantPanel({
  messages,
  onSendMessage,
  loading,
  models,
  activeModel,
  onModelChange,
  experienceLevel,
  onExperienceChange,
  onFileClick,
}) {
  const [input, setInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expDropdownOpen, setExpDropdownOpen] = useState(false);
  const messagesEnd = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    onSendMessage(text);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  }, [input, loading, onSendMessage]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback((e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
  }, []);

  const SUGGESTED_QUESTIONS = [
    "Show me the call chain",
    "What are the dependencies?",
    "Find similar functions"
  ];

  return (
    <div className="chat-container">
      {/* Header showing active model */}
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', padding: '8px 16px', position: 'relative' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ollama Runtime</span>
        <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setExpDropdownOpen(!expDropdownOpen)}>
              👨‍💻 {experienceLevel} <ChevronDown size={12} />
            </button>
            {expDropdownOpen && (
              <div className="glass-panel animate-slide-in-up" style={{
                position: 'absolute', top: 30, right: 0, width: 120, zIndex: 50,
                borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', gap: 2
              }}>
                {['Junior', 'Mid', 'Senior'].map(lvl => (
                  <div key={lvl} className={`tree-item ${experienceLevel === lvl ? 'active' : ''}`} style={{ padding: '6px 10px' }} onClick={() => {
                    onExperienceChange?.(lvl);
                    setExpDropdownOpen(false);
                  }}>
                    {experienceLevel === lvl ? <Check size={12} style={{ color: 'var(--accent-base)' }} /> : <span style={{ width: 12 }} />}
                    <span style={{ fontSize: 11, flex: 1 }}>{lvl}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setDropdownOpen(!dropdownOpen)}>
              <Cpu size={12} style={{ color: 'var(--accent-base)' }} /> {activeModel || 'Loading Models...'} <ChevronDown size={12} />
            </button>
            
            {dropdownOpen && (
            <div className="glass-panel animate-slide-in-up" style={{
              position: 'absolute', top: 30, right: 0, width: 200, zIndex: 50,
              borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', gap: 2
            }}>
              {(models || []).map(m => (
                <div key={m} className={`tree-item ${activeModel === m ? 'active' : ''}`} style={{ padding: '6px 10px' }} onClick={() => {
                  onModelChange?.(m);
                  setDropdownOpen(false);
                }}>
                  {activeModel === m ? <Check size={12} style={{ color: 'var(--accent-base)' }} /> : <span style={{ width: 12 }} />}
                  <span style={{ fontSize: 11, flex: 1 }}>{m}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state animate-fade-in-scale">
            <div className="empty-state-icon" style={{ fontSize: 48, filter: 'drop-shadow(0 0 10px var(--accent-base))' }}>✨</div>
            <div className="empty-state-title">Chillax.AI Assistant</div>
            <div className="empty-state-text" style={{ maxWidth: 220 }}>
              Ask anything about your architecture, select code to explain, or generate new features offline.
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble-wrapper ${msg.role}`}>
            <div className={`chat-message ${msg.role}`}>
              {msg.role === 'user' ? (
                <div>{msg.content}</div>
              ) : msg.role === 'assistant' ? (
                <>
                  <ReactMarkdown 
                    components={{
                      code({node, inline, className, children, ...props}) {
                        return (
                          <code className={className} style={{
                            background: inline ? 'rgba(0,0,0,0.3)' : '#000',
                            padding: inline ? '2px 4px' : '10px',
                            borderRadius: inline ? '4px' : '8px',
                            display: inline ? 'inline' : 'block',
                            border: inline ? 'none' : '1px solid var(--border-primary)',
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)'
                          }} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                  
                  {msg.referencedFiles && msg.referencedFiles.length > 0 && (
                    <div className="ref-files" style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', width: '100%', marginBottom: 4 }}>
                        📁 Context loaded from:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {msg.referencedFiles.map((ref, j) => (
                          <span key={j} className="suggested-pill" onClick={() => onFileClick?.(ref.module)} style={{ margin: 0 }}>
                            {ref.module.split('/').pop()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Show follow up questions randomly if it's the last message */}
                  {i === messages.length - 1 && !loading && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}><Reply size={10} /> Suggested</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {SUGGESTED_QUESTIONS.map(sq => (
                          <button key={sq} className="suggested-pill" onClick={() => { setInput(sq); onSendMessage(sq); }}>{sq}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--accent-orange)' }}>{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble-wrapper assistant animate-slide-in-up">
            <div className="chat-message assistant" style={{ padding: '8px 16px' }}>
              <div className="thinking-dots">
                <span className="thinking-dot"></span>
                <span className="thinking-dot"></span>
                <span className="thinking-dot"></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEnd} style={{ paddingBottom: 20 }} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            rows={1}
            style={{ height: 48 }}
            placeholder="Ask about your project..."
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <div className="chat-input-footer">
            <span style={{ opacity: input.length > 0 ? 1 : 0.5 }}>{input.length} chars</span>
            <span>
              <kbd style={{ background: 'var(--bg-elevated)', padding: '2px 4px', borderRadius: 4, marginRight: 4, border: '1px solid var(--border-primary)' }}>Ctrl</kbd> +
              <kbd style={{ background: 'var(--bg-elevated)', padding: '2px 4px', borderRadius: 4, marginLeft: 4, border: '1px solid var(--border-primary)' }}>Enter</kbd> to send
            </span>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{ alignSelf: 'flex-end', height: 38, width: 38, borderRadius: '50%', padding: 0 }}
        >
          <Send size={16} style={{ 
            transform: `translateX(${input.trim() ? '2px' : '0'})`, 
            transition: 'transform var(--transition-bounce)'
          }} />
        </button>
      </div>
    </div>
  );
}
