import React, { useState, useCallback, useMemo } from 'react';
import {
    ChevronRight, FolderOpen, Folder, FileCode2, File, FilePlus,
    FolderPlus, Pencil, Trash2, MoreHorizontal, FileText, FileJson,
} from 'lucide-react';
import { createFile, renameFile, deleteFile } from '../api/client';

/**
 * File Explorer — recursive tree with context menu for CRUD.
 */
export default function FileExplorer({
    tree, activeFile, onFileSelect, onRefresh,
}) {
    const [contextMenu, setContextMenu] = useState(null);
    const [creating, setCreating] = useState(null); // { parentPath, isDir }
    const [renaming, setRenaming] = useState(null); // node path
    const [newName, setNewName] = useState('');

    const handleContextMenu = useCallback((e, node) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    }, []);

    const closeMenu = useCallback(() => setContextMenu(null), []);

    const handleNewFile = useCallback((parentPath, isDir) => {
        setContextMenu(null);
        setCreating({ parentPath: parentPath || '', isDir });
        setNewName('');
    }, []);

    const handleCreateSubmit = useCallback(async () => {
        if (!newName.trim()) { setCreating(null); return; }
        const path = creating.parentPath ? `${creating.parentPath}/${newName}` : newName;
        try {
            await createFile(path, creating.isDir);
            onRefresh?.();
        } catch (err) {
            console.error(err);
        }
        setCreating(null);
        setNewName('');
    }, [newName, creating, onRefresh]);

    const handleRename = useCallback((nodePath) => {
        setContextMenu(null);
        setRenaming(nodePath);
        setNewName(nodePath.split('/').pop());
    }, []);

    const handleRenameSubmit = useCallback(async () => {
        if (!newName.trim() || !renaming) { setRenaming(null); return; }
        const parts = renaming.split('/');
        parts[parts.length - 1] = newName;
        const newPath = parts.join('/');
        try {
            await renameFile(renaming, newPath);
            onRefresh?.();
        } catch (err) {
            console.error(err);
        }
        setRenaming(null);
        setNewName('');
    }, [newName, renaming, onRefresh]);

    const handleDelete = useCallback(async (nodePath) => {
        setContextMenu(null);
        if (!confirm(`Delete "${nodePath}"?`)) return;
        try {
            await deleteFile(nodePath);
            onRefresh?.();
        } catch (err) {
            console.error(err);
        }
    }, [onRefresh]);

    if (!tree || tree.length === 0) {
        return (
            <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-state-icon">📂</div>
                <div className="empty-state-title">No project open</div>
                <div className="empty-state-text">
                    Open a folder or create a new project to start coding.
                </div>
            </div>
        );
    }

    return (
        <div className="file-tree" onClick={closeMenu}>
            {/* Top action bar */}
            <div className="file-tree-actions">
                <button className="btn-icon" title="New File" onClick={() => handleNewFile('', false)}>
                    <FilePlus size={15} />
                </button>
                <button className="btn-icon" title="New Folder" onClick={() => handleNewFile('', true)}>
                    <FolderPlus size={15} />
                </button>
            </div>

            {/* Inline create input at root level */}
            {creating && !creating.parentPath && (
                <div className="tree-item" style={{ paddingLeft: 8 }}>
                    <span className="tree-indent" />
                    {creating.isDir ? <FolderPlus size={14} className="tree-item-icon folder" /> : <FilePlus size={14} className="tree-item-icon python" />}
                    <input
                        className="tree-rename-input"
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={handleCreateSubmit}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSubmit(); if (e.key === 'Escape') setCreating(null); }}
                        placeholder={creating.isDir ? 'folder name' : 'filename.py'}
                    />
                </div>
            )}

            {tree.map((node) => (
                <TreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    activeFile={activeFile}
                    onFileSelect={onFileSelect}
                    onContextMenu={handleContextMenu}
                    renaming={renaming}
                    newName={newName}
                    setNewName={setNewName}
                    onRenameSubmit={handleRenameSubmit}
                    setRenaming={setRenaming}
                    creating={creating}
                    createName={newName}
                    setCreateName={setNewName}
                    onCreateSubmit={handleCreateSubmit}
                    setCreating={setCreating}
                    onNewFile={handleNewFile}
                />
            ))}

            {/* Context menu */}
            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.node?.type === 'directory' && (
                        <>
                            <div className="context-menu-item" onClick={() => handleNewFile(contextMenu.node.path, false)}>
                                <FilePlus size={14} /> New File
                            </div>
                            <div className="context-menu-item" onClick={() => handleNewFile(contextMenu.node.path, true)}>
                                <FolderPlus size={14} /> New Folder
                            </div>
                            <div className="context-menu-divider" />
                        </>
                    )}
                    <div className="context-menu-item" onClick={() => handleRename(contextMenu.node.path)}>
                        <Pencil size={14} /> Rename
                    </div>
                    <div className="context-menu-item danger" onClick={() => handleDelete(contextMenu.node.path)}>
                        <Trash2 size={14} /> Delete
                    </div>
                </div>
            )}
        </div>
    );
}

function TreeNode({
    node, depth, activeFile, onFileSelect, onContextMenu,
    renaming, newName, setNewName, onRenameSubmit, setRenaming,
    creating, createName, setCreateName, onCreateSubmit, setCreating,
    onNewFile,
}) {
    const [expanded, setExpanded] = useState(depth < 1);

    const handleClick = useCallback(() => {
        if (node.type === 'directory') {
            setExpanded((p) => !p);
        } else {
            onFileSelect(node.path);
        }
    }, [node, onFileSelect]);

    const isActive = node.type === 'file' && node.path === activeFile;
    const indent = depth * 16;
    const isRenaming = renaming === node.path;
    const isCreatingHere = creating && creating.parentPath === node.path;

    const FileIconComponent = useMemo(() => {
        const name = node.name.toLowerCase();
        if (name.endsWith('.py')) return <FileCode2 size={15} className="tree-item-icon python" />;
        if (name.endsWith('.json')) return <FileJson size={15} className="tree-item-icon" style={{ color: 'var(--accent-orange)' }} />;
        if (name.endsWith('.md')) return <FileText size={15} className="tree-item-icon" style={{ color: 'var(--accent-cyan)' }} />;
        return <File size={15} className="tree-item-icon" />;
    }, [node.name]);

    return (
        <>
            <div
                className={`tree-item${isActive ? ' active' : ''}`}
                style={{ paddingLeft: `${indent + 8}px` }}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, node)}
                title={node.path}
            >
                {node.type === 'directory' ? (
                    <>
                        <ChevronRight size={14} className={`tree-chevron${expanded ? ' open' : ''}`} />
                        {expanded ? <FolderOpen size={15} className="tree-item-icon folder" /> : <Folder size={15} className="tree-item-icon folder" />}
                    </>
                ) : (
                    <>
                        <span className="tree-indent" />
                        {FileIconComponent}
                    </>
                )}
                {isRenaming ? (
                    <input
                        className="tree-rename-input"
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={onRenameSubmit}
                        onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') setRenaming(null); }}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="tree-item-name">{node.name}</span>
                )}
            </div>

            {node.type === 'directory' && expanded && (
                <>
                    {/* Inline create input inside this folder */}
                    {isCreatingHere && (
                        <div className="tree-item" style={{ paddingLeft: `${indent + 24}px` }}>
                            <span className="tree-indent" />
                            {creating.isDir ? <FolderPlus size={14} className="tree-item-icon folder" /> : <FilePlus size={14} className="tree-item-icon python" />}
                            <input
                                className="tree-rename-input"
                                autoFocus
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                onBlur={onCreateSubmit}
                                onKeyDown={(e) => { if (e.key === 'Enter') onCreateSubmit(); if (e.key === 'Escape') setCreating(null); }}
                                placeholder={creating.isDir ? 'folder name' : 'filename.py'}
                            />
                        </div>
                    )}
                    {node.children?.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            activeFile={activeFile}
                            onFileSelect={onFileSelect}
                            onContextMenu={onContextMenu}
                            renaming={renaming}
                            newName={newName}
                            setNewName={setNewName}
                            onRenameSubmit={onRenameSubmit}
                            setRenaming={setRenaming}
                            creating={creating}
                            createName={createName}
                            setCreateName={setCreateName}
                            onCreateSubmit={onCreateSubmit}
                            setCreating={setCreating}
                            onNewFile={onNewFile}
                        />
                    ))}
                </>
            )}
        </>
    );
}
