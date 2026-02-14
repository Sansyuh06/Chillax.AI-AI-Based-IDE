import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eye, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { visualizeFile } from '../api/client';

/* ─── Mermaid Loader (CDN) ─── */
async function getMermaid() {
    if (window.mermaid) {
        if (!window.mermaid.mic) { // mic = mermaid initialized flag (custom)
            window.mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                themeVariables: {
                    darkMode: true,
                    background: '#0d1117',
                    primaryColor: '#1a2332',
                    primaryTextColor: '#e6edf3',
                    primaryBorderColor: '#30363d',
                    lineColor: '#484f58',
                    secondaryColor: '#161b22',
                    tertiaryColor: '#1c2333',
                    fontFamily: '"Inter", "Segoe UI", sans-serif',
                    fontSize: '13px',
                    nodeBorder: '#30363d',
                    mainBkg: '#161b22',
                    clusterBkg: '#0d1117',
                    edgeLabelBackground: '#0d1117',
                },
                flowchart: {
                    htmlLabels: true,
                    curve: 'basis',
                    nodeSpacing: 35,
                    rankSpacing: 50,
                    padding: 15,
                    useMaxWidth: false,
                },
                securityLevel: 'loose',
            });
            window.mermaid.mic = true;
        }
        return window.mermaid;
    }

    // Retry a few times if script hasn't loaded yet
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (window.mermaid) return getMermaid();
    }
    throw new Error('Mermaid failed to load. Please check your internet connection.');
}

export default function Visualizer({ activeFile }) {
    const containerRef = useRef(null);
    const svgContainerRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rendered, setRendered] = useState(false);
    const [zoom, setZoom] = useState(1);
    const panRef = useRef({ x: 0, y: 0 });
    const dragRef = useRef({ dragging: false, startX: 0, startY: 0, panStartX: 0, panStartY: 0 });

    /* ─── Apply transform ─── */
    const applyTransform = useCallback((z) => {
        const el = svgContainerRef.current;
        if (!el) return;
        const p = panRef.current;
        const currentZoom = z !== undefined ? z : zoom;
        el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${currentZoom})`;
    }, [zoom]);

    useEffect(() => { applyTransform(); }, [zoom, applyTransform]);

    /* ─── Fit to view ─── */
    const fitView = useCallback(() => {
        const svgEl = svgContainerRef.current?.querySelector('svg');
        const cont = containerRef.current;
        if (!svgEl || !cont) return;
        const contR = cont.getBoundingClientRect();
        const svgW = svgEl.scrollWidth || svgEl.clientWidth || 800;
        const svgH = svgEl.scrollHeight || svgEl.clientHeight || 600;
        const scaleX = (contR.width - 40) / svgW;
        const scaleY = (contR.height - 40) / svgH;
        const ideal = Math.max(0.25, Math.min(Math.min(scaleX, scaleY), 1.5));
        panRef.current = { x: 0, y: 0 };
        setZoom(ideal);
        applyTransform(ideal);
    }, [applyTransform]);

    /* ─── Load & Render ─── */
    const loadFlow = useCallback(async () => {
        if (!activeFile) return;
        setLoading(true);
        setError(null);
        setRendered(false);

        try {
            const data = await visualizeFile(activeFile);
            if (!data.mermaid) throw new Error('No diagram data returned');

            const merm = await getMermaid();
            const container = svgContainerRef.current;
            if (!container) return;

            container.innerHTML = '';

            const id = `mmd-${Date.now()}`;
            // Mermaid v10 render returns { svg }
            const { svg } = await merm.render(id, data.mermaid);
            container.innerHTML = svg;

            // Style the rendered SVG
            const svgEl = container.querySelector('svg');
            if (svgEl) {
                svgEl.style.maxWidth = 'none';
                svgEl.style.height = 'auto';
                svgEl.removeAttribute('width');

                // Interactive nodes
                svgEl.querySelectorAll('.node').forEach(node => {
                    node.style.cursor = 'pointer';
                    node.style.transition = 'filter 0.2s ease';
                    node.addEventListener('mouseenter', () => {
                        node.style.filter = 'brightness(1.4) drop-shadow(0 0 10px rgba(88,166,255,0.5))';
                    });
                    node.addEventListener('mouseleave', () => {
                        node.style.filter = 'none';
                    });
                });

                // Smooth edges
                svgEl.querySelectorAll('.edge path').forEach(p => {
                    p.style.strokeWidth = '2';
                    p.style.opacity = '0.6';
                });

                // Entry animation
                svgEl.style.opacity = '0';
                svgEl.style.transform = 'scale(0.95)';
                svgEl.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                requestAnimationFrame(() => {
                    svgEl.style.opacity = '1';
                    svgEl.style.transform = 'scale(1)';
                });
            }

            setRendered(true);
            panRef.current = { x: 0, y: 0 };

            // Auto-fit after render settles
            setTimeout(() => {
                const svg2 = container.querySelector('svg');
                const contR = containerRef.current?.getBoundingClientRect();
                if (svg2 && contR) {
                    const w = svg2.scrollWidth || svg2.clientWidth || 800;
                    const h = svg2.scrollHeight || svg2.clientHeight || 600;
                    const sx = (contR.width - 30) / w;
                    const sy = (contR.height - 30) / h;
                    const idealZoom = Math.max(0.25, Math.min(Math.min(sx, sy), 1.5));
                    panRef.current = { x: 0, y: 0 };
                    setZoom(idealZoom);
                }
            }, 200);
        } catch (e) {
            setError(e.message || 'Failed to render diagram');
            console.error('Visualize error:', e);
        }
        setLoading(false);
    }, [activeFile]);

    /* ─── Pan handlers ─── */
    const onMouseDown = useCallback(e => {
        if (e.target.closest('.node')) return;
        dragRef.current = {
            dragging: true,
            startX: e.clientX, startY: e.clientY,
            panStartX: panRef.current.x, panStartY: panRef.current.y,
        };
    }, []);

    const onMouseMove = useCallback(e => {
        if (!dragRef.current.dragging) return;
        panRef.current = {
            x: dragRef.current.panStartX + (e.clientX - dragRef.current.startX),
            y: dragRef.current.panStartY + (e.clientY - dragRef.current.startY),
        };
        applyTransform();
    }, [applyTransform]);

    const onMouseUp = useCallback(() => { dragRef.current.dragging = false; }, []);

    const onWheel = useCallback(e => {
        e.preventDefault();
        setZoom(z => Math.max(0.15, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
    }, []);

    /* ─── Empty state ─── */
    if (!activeFile) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-title">Code Visualizer</div>
                <div className="empty-state-text">Open a Python file and click Visualize to see a flowchart.</div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div className="viz-controls">
                <button className="btn btn-primary" onClick={loadFlow} disabled={loading}
                    style={{ fontSize: 11, padding: '4px 14px' }}>
                    <Eye size={12} />{' '}{loading ? 'Generating…' : 'Visualize'}
                </button>
                <div className="viz-divider" />
                <button className="btn-icon" onClick={() => setZoom(z => Math.min(3, z * 1.25))} title="Zoom in">
                    <ZoomIn size={13} />
                </button>
                <button className="btn-icon" onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} title="Zoom out">
                    <ZoomOut size={13} />
                </button>
                <button className="btn-icon" onClick={fitView} title="Fit to view">
                    <Maximize size={13} />
                </button>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {rendered ? `${Math.round(zoom * 100)}%` : ''} {activeFile?.split('/').pop()}
                </span>
            </div>

            {error && (
                <div style={{
                    padding: '6px 12px', background: '#f8514918',
                    color: '#f85149', fontSize: 11, borderBottom: '1px solid #30363d',
                }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Diagram */}
            <div
                ref={containerRef}
                style={{
                    flex: 1, overflow: 'hidden', position: 'relative',
                    cursor: dragRef.current?.dragging ? 'grabbing' : 'grab',
                    background: '#0d1117',
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={onWheel}
            >
                <div
                    ref={svgContainerRef}
                    style={{
                        transformOrigin: 'center top',
                        transition: dragRef.current?.dragging ? 'none' : 'transform 0.15s ease',
                        padding: 20,
                        minWidth: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                    }}
                />

                {!rendered && !loading && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        color: '#484f58', gap: 12,
                    }}>
                        <div style={{ fontSize: 40 }}>📊</div>
                        <div style={{ fontSize: 13 }}>
                            Click <strong style={{ color: '#58a6ff' }}>Visualize</strong> to generate a flowchart
                        </div>
                        <div style={{ fontSize: 11, color: '#30363d' }}>
                            Supports Python files • Shows execution flow as a diagram
                        </div>
                    </div>
                )}

                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#0d111799',
                    }}>
                        <div className="loading-spinner" style={{ width: 32, height: 32 }} />
                    </div>
                )}
            </div>

            {/* Legend */}
            {rendered && (
                <div style={{
                    display: 'flex', gap: 12, padding: '4px 10px',
                    borderTop: '1px solid var(--border-primary)',
                    fontSize: 10, color: '#6e7681', flexWrap: 'wrap',
                    background: 'var(--bg-surface)',
                }}>
                    <span><b style={{ color: '#bc8cff' }}>●</b> Function</span>
                    <span><b style={{ color: '#d29922' }}>◆</b> Condition</span>
                    <span><b style={{ color: '#3fb950' }}>●</b> Call</span>
                    <span><b style={{ color: '#39d2c0' }}>●</b> Import</span>
                    <span><b style={{ color: '#f778ba' }}>●</b> Loop</span>
                    <span><b style={{ color: '#f85149' }}>●</b> Return</span>
                    <span style={{ flex: 1 }} />
                    <span>Scroll zoom · Drag pan</span>
                </div>
            )}
        </div>
    );
}
