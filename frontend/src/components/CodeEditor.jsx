import React, { useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { Save, Sparkles, Play, X, Circle } from 'lucide-react';
import { getLanguage } from '../api/client';

/**
 * Multi-tab code editor with Monaco, save, explain, and run.
 */
export default function CodeEditor({
    tabs,
    activeTab,
    onTabSelect,
    onTabClose,
    onContentChange,
    onSave,
    onExplainSelection,
    onRun,
    saving,
}) {
    const editorRef = useRef(null);

    const activeTabData = useMemo(
        () => tabs.find((t) => t.path === activeTab),
        [tabs, activeTab]
    );

    const handleMount = useCallback((editor) => {
        editorRef.current = editor;
        editor.addAction({
            id: 'save-file',
            label: 'Save File',
            keybindings: [2048 | 49], // Ctrl+S
            run: () => onSave?.(),
        });
    }, [onSave]);

    const handleExplain = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const selection = editor.getSelection();
        const selectedText = editor.getModel().getValueInRange(selection);
        if (!selectedText.trim()) {
            alert('Select some code first, then click "Explain Selection".');
            return;
        }
        onExplainSelection?.(selectedText);
    }, [onExplainSelection]);

    // No tabs open → welcome screen
    if (!tabs || tabs.length === 0) {
        return (
            <div className="welcome-screen">
                <div className="welcome-logo">🧊</div>
                <div className="welcome-title">Chillax.AI</div>
                <div className="welcome-subtitle">
                    Your AI-powered Python IDE. Open a file from the explorer or create a new project to start coding.
                </div>
                <div className="welcome-keys">
                    <div className="welcome-key"><kbd>Ctrl</kbd>+<kbd>S</kbd> Save file</div>
                    <div className="welcome-key"><kbd>Ctrl</kbd>+<kbd>N</kbd> New file</div>
                    <div className="welcome-key"><kbd>Select</kbd> → <kbd>Explain</kbd> Ask AI about code</div>
                    <div className="welcome-key"><kbd>▶ Run</kbd> Execute Python file</div>
                </div>
            </div>
        );
    }

    const language = activeTabData ? getLanguage(activeTabData.path) : 'plaintext';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Tab bar */}
            <div className="editor-tabs">
                {tabs.map((tab) => (
                    <div
                        key={tab.path}
                        className={`editor-tab${tab.path === activeTab ? ' active' : ''}`}
                        onClick={() => onTabSelect(tab.path)}
                        title={tab.path}
                    >
                        {tab.modified && <Circle size={8} fill="var(--accent-orange)" stroke="none" style={{ flexShrink: 0 }} />}
                        <span>{tab.path.split('/').pop()}</span>
                        <button
                            className="tab-close"
                            onClick={(e) => { e.stopPropagation(); onTabClose(tab.path); }}
                            title="Close"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            {activeTabData && (
                <div className="editor-toolbar">
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeTabData.path}
                    </span>
                    <span style={{ flex: 1 }} />
                    <button className="btn btn-secondary" onClick={onSave} disabled={saving}>
                        <Save size={14} />
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    {language === 'python' && (
                        <button className="btn btn-secondary" onClick={onRun} title="Run Python file">
                            <Play size={14} />
                            Run
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={handleExplain}>
                        <Sparkles size={14} />
                        Explain Selection
                    </button>
                </div>
            )}

            {/* Editor */}
            <div style={{ flex: 1 }}>
                {activeTabData && (
                    <Editor
                        key={activeTab}
                        height="100%"
                        language={language}
                        theme="vs-dark"
                        value={activeTabData.content}
                        onChange={(val) => onContentChange(activeTab, val)}
                        onMount={handleMount}
                        options={{
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                            fontLigatures: true,
                            minimap: { enabled: true, scale: 1 },
                            scrollBeyondLastLine: false,
                            smoothScrolling: true,
                            cursorBlinking: 'smooth',
                            cursorSmoothCaretAnimation: 'on',
                            renderLineHighlight: 'all',
                            padding: { top: 12 },
                            bracketPairColorization: { enabled: true },
                            guides: { bracketPairs: true },
                            wordWrap: 'off',
                            automaticLayout: true,
                        }}
                    />
                )}
            </div>
        </div>
    );
}
