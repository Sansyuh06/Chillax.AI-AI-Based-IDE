import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    FolderSearch, Cpu, MessageSquare, Network, FolderOpen,
    FolderPlus, TerminalSquare, ChevronDown, ChevronUp, X,
    Settings, Info, Eye,
} from 'lucide-react';
import FileExplorer from './components/FileExplorer';
import CodeEditor from './components/CodeEditor';
import AssistantPanel from './components/AssistantPanel';
import CodeMap from './components/CodeMap';
import Visualizer from './components/Visualizer';
import Terminal from './components/Terminal';
import SettingsModal from './components/SettingsModal';
import {
    loadFiles, readFile, saveFile, openProject, newProject,
    analyzeProject, explainCode, askProject, runPython,
    getRecentProjects, healthCheck, listModels, getGitContext, generateDocs
} from './api/client';

export default function App() {
    // ---- Project state ----
    const [projectRoot, setProjectRoot] = useState(null);
    const [projectName, setProjectName] = useState('');
    const [fileTree, setFileTree] = useState([]);

    // ---- Editor tabs ----
    const [tabs, setTabs] = useState([]); // [{ path, content, savedContent, modified }]
    const [activeTab, setActiveTab] = useState(null);

    // ---- Right panel ----
    const [rightTab, setRightTab] = useState('assistant');
    const [graph, setGraph] = useState(null);
    const [messages, setMessages] = useState([]);

    // ---- Bottom panel ----
    const [terminalVisible, setTerminalVisible] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState(250);

    // ---- Panel Resize ----
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const [rightPanelWidth, setRightPanelWidth] = useState(380);

    // ---- Status ----
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [ollamaOk, setOllamaOk] = useState(true);
    const [recentProjects, setRecentProjects] = useState([]);
    const [showWelcome, setShowWelcome] = useState(true);
    const [experienceLevel, setExperienceLevel] = useState('Mid');
    const [models, setModels] = useState(['llama3.1:8b']);
    const [activeModel, setActiveModel] = useState('llama3.1:8b');
    const [settingsOpen, setSettingsOpen] = useState(false);

    // ---- Boot ----
    useEffect(() => {
        healthCheck().then(() => setOllamaOk(true)).catch(() => setOllamaOk(false));
        getRecentProjects().then((d) => setRecentProjects(d.projects || [])).catch(() => { });
        listModels().then(data => {
            if (data.models && data.models.length > 0) {
                setModels(data.models);
                setActiveModel(data.models[0]);
            }
        }).catch(() => {});
        // Auto-load sample project
        loadFiles().then((data) => {
            setFileTree(data.tree || []);
            setProjectRoot(data.root);
            setProjectName(data.root?.split('/').pop() || 'Chillax.AI');
            setShowWelcome(false);
        }).catch(() => { });
    }, []);

    // ---- Refresh file tree ----
    const refreshTree = useCallback(async () => {
        try {
            const data = await loadFiles();
            setFileTree(data.tree || []);
        } catch { }
    }, []);

    // ---- File operations ----
    const handleFileSelect = useCallback(async (filePath) => {
        // Check if tab already open
        const existing = tabs.find((t) => t.path === filePath);
        if (existing) {
            setActiveTab(filePath);
            return;
        }
        try {
            const data = await readFile(filePath);
            setTabs((prev) => [...prev, {
                path: filePath,
                content: data.content,
                savedContent: data.content,
                modified: false,
            }]);
            setActiveTab(filePath);
        } catch (err) {
            console.error('Failed to load file:', err);
        }
    }, [tabs]);

    const handleTabClose = useCallback((path) => {
        const tab = tabs.find((t) => t.path === path);
        if (tab?.modified && !confirm(`"${path.split('/').pop()}" has unsaved changes. Close anyway?`)) return;

        setTabs((prev) => {
            const next = prev.filter((t) => t.path !== path);
            if (activeTab === path) {
                setActiveTab(next.length > 0 ? next[next.length - 1].path : null);
            }
            return next;
        });
    }, [tabs, activeTab]);

    const handleContentChange = useCallback((path, newContent) => {
        setTabs((prev) => prev.map((t) =>
            t.path === path
                ? { ...t, content: newContent, modified: newContent !== t.savedContent }
                : t
        ));
    }, []);

    const handleSave = useCallback(async () => {
        if (!activeTab) return;
        const tab = tabs.find((t) => t.path === activeTab);
        if (!tab) return;
        setSaving(true);
        try {
            await saveFile(activeTab, tab.content);
            setTabs((prev) => prev.map((t) =>
                t.path === activeTab ? { ...t, savedContent: t.content, modified: false } : t
            ));
        } catch (err) {
            console.error('Failed to save:', err);
        }
        setSaving(false);
    }, [activeTab, tabs]);

    // ---- Project management ----
    const handleOpenFolder = useCallback(async () => {
        let folderPath;
        if (window.electronAPI) {
            folderPath = await window.electronAPI.openFolder();
        } else {
            folderPath = prompt('Enter project folder path:');
        }
        if (!folderPath) return;

        try {
            const data = await openProject(folderPath);
            setProjectRoot(data.root);
            setProjectName(data.root.split('/').pop());
            setTabs([]);
            setActiveTab(null);
            setGraph(null);
            setShowWelcome(false);
            await refreshTree();
            getRecentProjects().then((d) => setRecentProjects(d.projects || [])).catch(() => { });
        } catch (err) {
            alert(`Failed to open project: ${err.message}`);
        }
    }, [refreshTree]);

    const handleNewProject = useCallback(async () => {
        let parentPath, name;
        if (window.electronAPI) {
            parentPath = await window.electronAPI.openFolder();
            if (!parentPath) return;
            name = prompt('Project name:');
        } else {
            parentPath = prompt('Parent folder path:');
            if (!parentPath) return;
            name = prompt('Project name:');
        }
        if (!name) return;

        try {
            const data = await newProject(parentPath, name);
            setProjectRoot(data.root);
            setProjectName(name);
            setTabs([]);
            setActiveTab(null);
            setGraph(null);
            setShowWelcome(false);
            await refreshTree();
            getRecentProjects().then((d) => setRecentProjects(d.projects || [])).catch(() => { });
        } catch (err) {
            alert(`Failed to create project: ${err.message}`);
        }
    }, [refreshTree]);

    const handleOpenRecent = useCallback(async (path) => {
        try {
            const data = await openProject(path);
            setProjectRoot(data.root);
            setProjectName(data.root.split('/').pop());
            setTabs([]);
            setActiveTab(null);
            setGraph(null);
            setShowWelcome(false);
            await refreshTree();
        } catch (err) {
            alert(`Failed to open project: ${err.message}`);
        }
    }, [refreshTree]);

    // ---- Analyze ----
    const handleAnalyze = useCallback(async () => {
        setAnalyzing(true);
        try {
            const data = await analyzeProject();
            setGraph(data);
            setRightTab('codemap');
            await refreshTree();
            setMessages((prev) => [...prev, {
                role: 'system',
                content: `✅ Project analyzed: ${data.stats.total_modules} modules, ${data.stats.total_functions} functions, ${data.stats.total_classes} classes.`,
            }]);
        } catch (err) {
            setMessages((prev) => [...prev, { role: 'system', content: `❌ Analysis failed: ${err.message}` }]);
        }
        setAnalyzing(false);
    }, [refreshTree]);

    // ---- AI ----
    const handleExplainSelection = useCallback(async (selectedText) => {
        setRightTab('assistant');
        setMessages((prev) => [...prev, {
            role: 'user',
            content: `**Explain this code:**\n\`\`\`python\n${selectedText.slice(0, 500)}\n\`\`\``,
        }]);
        setLoading(true);
        try {
            let gitCtx = null;
            try {
                const gitRes = await getGitContext(activeTab);
                if (gitRes.context) gitCtx = gitRes.context;
            } catch(e) {}

            const data = await explainCode({ 
                filePath: activeTab, 
                selectedCode: selectedText,
                experienceLevel,
                gitContext: gitCtx
            });
            setMessages((prev) => [...prev, { role: 'assistant', content: data.explanation }]);
        } catch (err) {
            setMessages((prev) => [...prev, { role: 'system', content: `❌ ${err.message}` }]);
        }
        setLoading(false);
    }, [activeTab, experienceLevel]);

    const handleSendMessage = useCallback(async (text) => {
        setMessages((prev) => [...prev, { role: 'user', content: text }]);
        setLoading(true);
        try {
            const data = await askProject(text, experienceLevel);
            setMessages((prev) => [...prev, {
                role: 'assistant', content: data.answer, referencedFiles: data.referenced_files,
            }]);
        } catch (err) {
            setMessages((prev) => [...prev, { role: 'system', content: `❌ ${err.message}` }]);
        }
        setLoading(false);
    }, [experienceLevel]);

    const handleMapAskAI = useCallback((text) => {
        setRightTab('assistant');
        handleSendMessage(text);
    }, [handleSendMessage]);

    const handleGenerateDocs = useCallback(async (selectedText) => {
        if (!activeTab) return null;
        setMessages(prev => [...prev, { role: 'assistant', content: `Generating docstring for selection in \`${activeTab.split('/').pop()}\`...` }]);
        try {
            const data = await generateDocs({ filePath: activeTab, selectedCode: selectedText });
            return data.docstring;
        } catch (err) {
            setMessages(prev => [...prev, { role: 'system', content: `❌ Failed to generate docs: ${err.message}` }]);
            return null;
        }
    }, [activeTab]);

    // ---- Run Python ----
    const handleRun = useCallback(async () => {
        if (!activeTab) return;
        setTerminalVisible(true);
        setMessages((prev) => [...prev, {
            role: 'system',
            content: `▶ Running ${activeTab}...`,
        }]);
        // Send run command to terminal
        setTimeout(() => {
            Terminal.sendCommand(`python ${activeTab}`);
        }, 300);
    }, [activeTab]);

    // ---- Code Map interactions ----
    const handleFunctionClick = useCallback(async (modulePath, line) => {
        await handleFileSelect(modulePath);
    }, [handleFileSelect]);

    // ---- Terminal resize ----
    const termResizing = useRef(false);
    const handleTermResize = useCallback((e) => {
        e.preventDefault();
        termResizing.current = true;
        const startY = e.clientY;
        const startH = terminalHeight;

        const onMove = (e) => {
            if (!termResizing.current) return;
            const delta = startY - e.clientY;
            setTerminalHeight(Math.max(100, Math.min(500, startH + delta)));
        };
        const onUp = () => {
            termResizing.current = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [terminalHeight]);

    // ---- Splitter dragging ----
    const startDragLeft = useCallback((e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = sidebarWidth;
        const onMove = (ev) => setSidebarWidth(Math.max(150, Math.min(600, startW + (ev.clientX - startX))));
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [sidebarWidth]);

    const startDragRight = useCallback((e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = rightPanelWidth;
        const onMove = (ev) => setRightPanelWidth(Math.max(200, Math.min(800, startW - (ev.clientX - startX))));
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [rightPanelWidth]);

    // ---- Current tab info for status bar ----
    const currentTab = tabs.find((t) => t.path === activeTab);
    const lineCount = currentTab ? currentTab.content.split('\n').length : 0;

    return (
        <div className="app-container">
            {/* ======================== TOOLBAR ======================== */}
            <div className="toolbar">
                <div className="toolbar-logo">
                    <span className="emoji">🧊</span>
                    <span className="brand">Chillax.AI</span>
                </div>

                {/* Project actions */}
                <div className="toolbar-group">
                    <button className="btn btn-ghost" onClick={handleOpenFolder} title="Open Folder">
                        <FolderOpen size={15} /> Open Folder
                    </button>
                    <button className="btn btn-ghost" onClick={handleNewProject} title="New Project">
                        <FolderPlus size={15} /> New Project
                    </button>
                </div>

                <div className="toolbar-spacer" />

                {projectName && (
                    <span className="toolbar-project-name" title={projectRoot}>
                        {projectName}
                    </span>
                )}

                <button
                    className="btn btn-primary"
                    onClick={handleAnalyze}
                    disabled={analyzing}
                >
                    {analyzing ? (
                        <><div className="loading-spinner" style={{ width: 14, height: 14 }} /> Analyzing…</>
                    ) : (
                        <><Cpu size={14} /> Analyze Project</>
                    )}
                </button>

                <button
                    className={`btn btn-ghost${terminalVisible ? ' active' : ''}`}
                    onClick={() => setTerminalVisible(!terminalVisible)}
                    title="Toggle Terminal"
                >
                    <TerminalSquare size={15} />
                </button>

                <div className="toolbar-status" style={{ cursor: 'pointer' }} onClick={() => setSettingsOpen(true)}>
                    <Settings size={14} style={{ marginRight: 6 }} />
                    <span className={`status-dot${ollamaOk ? '' : ' disconnected'}`} />
                    {ollamaOk ? 'Ollama' : 'Offline'}
                </div>
            </div>

            {/* ======================== MAIN AREA ======================== */}
            <div className="main-area">
                {/* Left — File Explorer */}
                <div className="panel panel-sidebar" style={{ width: sidebarWidth, flexShrink: 0, minWidth: 150 }}>
                    <div className="panel-header">
                        <FolderSearch size={16} className="panel-header-icon" />
                        EXPLORER
                    </div>
                    <div className="panel-body">
                        <FileExplorer
                            tree={fileTree}
                            activeFile={activeTab}
                            onFileSelect={handleFileSelect}
                            onRefresh={refreshTree}
                        />
                    </div>
                    {/* Recent projects */}
                    {recentProjects.length > 0 && (
                        <>
                            <div className="panel-header" style={{ borderTop: '1px solid var(--border-primary)' }}>
                                <Info size={14} className="panel-header-icon" />
                                RECENT
                            </div>
                            <div className="recent-list">
                                {recentProjects.slice(0, 5).map((p) => (
                                    <div
                                        key={p}
                                        className="recent-item"
                                        onClick={() => handleOpenRecent(p)}
                                        title={p}
                                    >
                                        <FolderOpen size={13} style={{ flexShrink: 0, color: 'var(--accent-orange)' }} />
                                        <span>{p.split('/').pop()}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Left Splitter */}
                <div className="vertical-splitter" onMouseDown={startDragLeft} />

                {/* Center — Editor + Terminal */}
                <div className="panel panel-editor" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <CodeEditor
                            tabs={tabs}
                            activeTab={activeTab}
                            onTabSelect={setActiveTab}
                            onTabClose={handleTabClose}
                            onContentChange={handleContentChange}
                            onSave={handleSave}
                            onExplainSelection={handleExplainSelection}
                            onGenerateDocs={handleGenerateDocs}
                            onRun={handleRun}
                            saving={saving}
                        />
                    </div>

                    {/* Terminal panel */}
                    {terminalVisible && (
                        <>
                            <div className="terminal-resize-handle" onMouseDown={handleTermResize} />
                            <div className="terminal-panel" style={{ height: terminalHeight }}>
                                <div className="terminal-header">
                                    <TerminalSquare size={13} />
                                    <span>Terminal</span>
                                    <span style={{ flex: 1 }} />
                                    <button className="btn-icon" onClick={() => setTerminalVisible(false)} style={{ padding: 2 }}>
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="terminal-body">
                                    <Terminal visible={terminalVisible} projectRoot={projectRoot} />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Right Splitter */}
                <div className="vertical-splitter" onMouseDown={startDragRight} />

                {/* Right — AI / Code Map / Visualize */}
                <div className="panel panel-right" style={{ width: rightPanelWidth, flexShrink: 0, minWidth: 200 }}>
                    <div className="tabs">
                        <button className={`tab${rightTab === 'assistant' ? ' active' : ''}`} onClick={() => setRightTab('assistant')}>
                            <MessageSquare size={14} className="tab-icon" /> Assistant
                        </button>
                        <button className={`tab${rightTab === 'codemap' ? ' active' : ''}`} onClick={() => setRightTab('codemap')}>
                            <Network size={14} className="tab-icon" /> Code Map
                        </button>
                        <button className={`tab${rightTab === 'visualize' ? ' active' : ''}`} onClick={() => setRightTab('visualize')}>
                            <Eye size={14} className="tab-icon" /> Visualize
                        </button>
                    </div>
                    <div className="panel-body">
                        {rightTab === 'assistant' ? (
                            <AssistantPanel
                                messages={messages}
                                onSendMessage={handleSendMessage}
                                loading={loading}
                                onFileClick={handleFileSelect}
                                models={models}
                                activeModel={activeModel}
                                onModelChange={setActiveModel}
                                experienceLevel={experienceLevel}
                                onExperienceChange={setExperienceLevel}
                            />
                        ) : rightTab === 'codemap' ? (
                            <CodeMap
                                graph={graph}
                                onFileSelect={handleFileSelect}
                                onFunctionClick={handleFunctionClick}
                                onAskAI={handleMapAskAI}
                            />
                        ) : (
                            <Visualizer activeFile={activeTab} />
                        )}
                    </div>
                </div>
            </div>

            {/* ======================== STATUS BAR ======================== */}
            <div className="status-bar">
                <div className="status-bar-section">
                    {projectRoot && <span>📁 {projectName}</span>}
                </div>
                <div className="status-bar-section">
                    {activeTab && (
                        <>
                            <span>Ln {lineCount}</span>
                            <span>·</span>
                            <span>{activeTab.split('.').pop().toUpperCase()}</span>
                            <span>·</span>
                            <span>UTF-8</span>
                        </>
                    )}
                </div>
                <div className="status-bar-section">
                    <span>Chillax.AI v0.2</span>
                </div>
            </div>

            <SettingsModal 
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                models={models}
                activeModel={activeModel}
                onModelChange={setActiveModel}
                experienceLevel={experienceLevel}
                onExperienceChange={setExperienceLevel}
            />
        </div>
    );
}
