import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, MessageSquare } from 'lucide-react';

/**
 * Right panel — AI chat / explanation assistant.
 */
export default function AssistantPanel({
    messages,
    onSendMessage,
    onExplainTriggered,
    loading,
    referencedFiles,
    onFileClick,
}) {
    const [input, setInput] = useState('');
    const messagesEnd = useRef(null);

    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text || loading) return;
        onSendMessage(text);
        setInput('');
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

    return (
        <div className="chat-container">
            {/* Messages */}
            <div className="chat-messages">
                {messages.length === 0 && (
                    <div className="empty-state" style={{ padding: '20px' }}>
                        <div className="empty-state-icon">💬</div>
                        <div className="empty-state-title">AI Assistant</div>
                        <div className="empty-state-text">
                            Select code and click <strong>Explain Selection</strong>, or ask a question about the project below.
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.role}`}>
                        {msg.role === 'user' ? (
                            <div>{msg.content}</div>
                        ) : msg.role === 'assistant' ? (
                            <>
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                {msg.referencedFiles && msg.referencedFiles.length > 0 && (
                                    <div className="ref-files">
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%', marginBottom: 4 }}>
                                            📁 Referenced files:
                                        </div>
                                        {msg.referencedFiles.map((ref, j) => (
                                            <span
                                                key={j}
                                                className="ref-file-chip"
                                                onClick={() => onFileClick?.(ref.module)}
                                                title={`Click to open ${ref.module}`}
                                            >
                                                {ref.module.split('/').pop()}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div>{msg.content}</div>
                        )}
                    </div>
                ))}

                {loading && (
                    <div className="loading-message">
                        <div className="loading-spinner" />
                        <span>AI is thinking…</span>
                    </div>
                )}

                <div ref={messagesEnd} />
            </div>

            {/* Input area */}
            <div className="chat-input-area">
                <textarea
                    className="chat-input"
                    rows={1}
                    placeholder="Ask about the project… e.g. 'How does checkout work?'"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                />
                <button
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={!input.trim() || loading}
                    title="Send (Enter)"
                >
                    <Send size={14} />
                </button>
            </div>
        </div>
    );
}
