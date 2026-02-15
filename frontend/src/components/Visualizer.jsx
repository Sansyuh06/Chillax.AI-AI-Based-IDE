import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eye, Maximize, ZoomIn, ZoomOut, Play, Pause, SkipForward, RotateCcw } from 'lucide-react';
import { visualizeFile } from '../api/client';

/* ─── Mermaid via CDN (window.mermaid) ─── */
let mermaidReady = false;
async function initMermaid() {
    if (mermaidReady && window.mermaid) return window.mermaid;
    // Wait for CDN script
    for (let i = 0; i < 40; i++) {
        if (window.mermaid) break;
        await new Promise(r => setTimeout(r, 150));
    }
    if (!window.mermaid) throw new Error('Mermaid not loaded — check internet');
    window.mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
            darkMode: true, background: '#0d1117',
            primaryColor: '#1a2332', primaryTextColor: '#e6edf3',
            primaryBorderColor: '#30363d', lineColor: '#484f58',
            secondaryColor: '#161b22', tertiaryColor: '#1c2333',
            fontFamily: '"Inter","Segoe UI",sans-serif', fontSize: '13px',
            nodeBorder: '#30363d', mainBkg: '#161b22',
        },
        flowchart: { htmlLabels: true, curve: 'basis', nodeSpacing: 40, rankSpacing: 55, padding: 15, useMaxWidth: false },
        securityLevel: 'loose',
    });
    mermaidReady = true;
    return window.mermaid;
}

/* ─── Color map for node kinds ─── */
const GLOW = {
    startStyle: { color: '#58a6ff', shadow: '0 0 18px #58a6ff88' },
    defineStyle: { color: '#bc8cff', shadow: '0 0 18px #bc8cff88' },
    callStyle: { color: '#3fb950', shadow: '0 0 18px #3fb95088' },
    importStyle: { color: '#39d2c0', shadow: '0 0 18px #39d2c088' },
    conditionStyle: { color: '#d29922', shadow: '0 0 18px #d2992288' },
    loopStyle: { color: '#f778ba', shadow: '0 0 18px #f778ba88' },
    returnStyle: { color: '#f85149', shadow: '0 0 18px #f8514988' },
    classStyle: { color: '#d29922', shadow: '0 0 18px #d2992288' },
    assignStyle: { color: '#8b949e', shadow: '0 0 12px #8b949e66' },
};
const DEFAULT_GLOW = { color: '#58a6ff', shadow: '0 0 14px #58a6ff66' };

export default function Visualizer({ activeFile }) {
    const containerRef = useRef(null);
    const svgBoxRef = useRef(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rendered, setRendered] = useState(false);

    // Animation state
    const [steps, setSteps] = useState([]);
    const [currentStep, setCurrentStep] = useState(-1);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(800); // ms per step
    const playRef = useRef(false);
    const speedRef = useRef(800);
    const stepsRef = useRef([]);

    // Pan/Zoom
    const [zoom, setZoom] = useState(1);
    const panRef = useRef({ x: 0, y: 0 });
    const dragRef = useRef({ on: false, sx: 0, sy: 0, px: 0, py: 0 });

    const applyTx = useCallback((z) => {
        const el = svgBoxRef.current;
        if (!el) return;
        const p = panRef.current;
        el.style.transform = `translate(${p.x}px,${p.y}px) scale(${z ?? zoom})`;
    }, [zoom]);

    useEffect(() => { applyTx(); }, [zoom, applyTx]);

    // Keep refs synced
    useEffect(() => { speedRef.current = speed; }, [speed]);
    useEffect(() => { stepsRef.current = steps; }, [steps]);

    /* ─────────── Highlight helpers ─────────── */
    const dimAll = useCallback(() => {
        const svg = svgBoxRef.current?.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('.node').forEach(n => {
            n.style.opacity = '0.4';
            n.style.filter = 'none';
            n.style.transition = 'opacity 0.4s ease, filter 0.4s ease';
        });
        svg.querySelectorAll('.edge path, .edge polygon').forEach(p => {
            p.style.opacity = '0.1';
            p.style.transition = 'opacity 0.4s ease';
        });
    }, []);

    const resetAll = useCallback(() => {
        const svg = svgBoxRef.current?.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('.node').forEach(n => {
            n.style.opacity = '1';
            n.style.filter = 'none';
            n.style.transition = 'opacity 0.4s ease, filter 0.4s ease';
        });
        svg.querySelectorAll('.edge path, .edge polygon').forEach(p => {
            p.style.opacity = '0.7';
            p.style.transition = 'opacity 0.4s ease';
        });
    }, []);

    const highlightNode = useCallback((sid, styleClass) => {
        const svg = svgBoxRef.current?.querySelector('svg');
        if (!svg) return;
        const node = svg.querySelector(`[id*="flowchart-${sid}-"]`) || svg.getElementById(sid);
        if (!node) return;
        const glow = GLOW[styleClass] || DEFAULT_GLOW;
        node.style.opacity = '1';
        node.style.filter = `drop-shadow(${glow.shadow}) brightness(1.3)`;
        // Pulse animation via scale
        node.style.transform = 'scale(1.08)';
        node.style.transformOrigin = 'center';
        setTimeout(() => { node.style.transform = 'scale(1)'; }, 300);
    }, []);

    const highlightEdge = useCallback((fromSid, toSid) => {
        const svg = svgBoxRef.current?.querySelector('svg');
        if (!svg) return;
        // Mermaid edge IDs follow a pattern; find edge connecting these nodes
        svg.querySelectorAll('.edge').forEach(edge => {
            const text = edge.id || '';
            if (text.includes(fromSid) && text.includes(toSid)) {
                const paths = edge.querySelectorAll('path, polygon');
                paths.forEach(p => {
                    p.style.opacity = '1';
                    p.style.stroke = '#58a6ff';
                    p.style.strokeWidth = '3';
                    // Animate dash
                    p.style.strokeDasharray = '8 4';
                    p.style.animation = 'flowPulse 0.6s linear infinite';
                });
            }
        });
    }, []);

    /* ─────────── Animation step ─────────── */
    const showStep = useCallback((idx) => {
        const allSteps = stepsRef.current;
        if (idx < 0 || idx >= allSteps.length) return;
        dimAll();
        // Highlight all steps up to current (trail)
        for (let i = 0; i <= idx; i++) {
            const s = allSteps[i];
            const svg = svgBoxRef.current?.querySelector('svg');
            if (!svg) continue;
            const node = svg.querySelector(`[id*="flowchart-${s.sid}-"]`) || svg.getElementById(s.sid);
            if (node) {
                node.style.opacity = i === idx ? '1' : '0.55';
                if (i === idx) {
                    highlightNode(s.sid, `${s.kind}Style`);
                }
            }
            // Show edge from parent
            if (s.parent) {
                const parentStep = allSteps.find(ps => ps.id === s.parent);
                if (parentStep) {
                    highlightEdge(parentStep.sid, s.sid);
                }
            }
        }
        setCurrentStep(idx);
    }, [dimAll, highlightNode, highlightEdge]);

    /* ─────────── Playback loop ─────────── */
    const playLoop = useCallback(async (startIdx) => {
        playRef.current = true;
        let idx = startIdx;
        while (playRef.current && idx < stepsRef.current.length) {
            showStep(idx);
            idx++;
            await new Promise(r => setTimeout(r, speedRef.current));
        }
        if (idx >= stepsRef.current.length) {
            playRef.current = false;
            setPlaying(false);
        }
    }, [showStep]);

    const handlePlay = useCallback(() => {
        if (playing) {
            playRef.current = false;
            setPlaying(false);
        } else {
            setPlaying(true);
            const start = currentStep >= steps.length - 1 ? 0 : currentStep + 1;
            playLoop(start);
        }
    }, [playing, currentStep, steps.length, playLoop]);

    const handleStep = useCallback(() => {
        playRef.current = false;
        setPlaying(false);
        const next = currentStep + 1;
        if (next < steps.length) showStep(next);
    }, [currentStep, steps.length, showStep]);

    const handleReset = useCallback(() => {
        playRef.current = false;
        setPlaying(false);
        setCurrentStep(-1);
        resetAll();
    }, [resetAll]);

    /* ─────────── Load & Render ─────────── */
    const loadFlow = useCallback(async () => {
        if (!activeFile) return;
        setLoading(true);
        setError(null);
        setRendered(false);
        setCurrentStep(-1);
        setPlaying(false);
        playRef.current = false;

        try {
            const data = await visualizeFile(activeFile);
            if (!data.mermaid) throw new Error('No diagram data');

            const merm = await initMermaid();
            const box = svgBoxRef.current;
            if (!box) return;
            box.innerHTML = '';

            const { svg } = await merm.render(`mmd${Date.now()}`, data.mermaid);
            box.innerHTML = svg;

            const svgEl = box.querySelector('svg');
            if (svgEl) {
                svgEl.style.maxWidth = 'none';
                svgEl.style.height = 'auto';
                svgEl.removeAttribute('width');

                // Make nodes clickable
                svgEl.querySelectorAll('.node').forEach(node => {
                    node.style.cursor = 'pointer';
                    node.style.transition = 'opacity 0.4s ease, filter 0.4s ease, transform 0.3s ease';
                    node.addEventListener('mouseenter', () => {
                        if (currentStep < 0) node.style.filter = 'brightness(1.3) drop-shadow(0 0 8px #58a6ff55)';
                    });
                    node.addEventListener('mouseleave', () => {
                        if (currentStep < 0) node.style.filter = 'none';
                    });
                    // Click to jump to step
                    node.addEventListener('click', () => {
                        const nodeId = node.id || '';
                        const stepIdx = data.steps.findIndex(s => nodeId.includes(`flowchart-${s.sid}-`));
                        if (stepIdx >= 0) showStep(stepIdx);
                    });
                });

                // Style edges
                svgEl.querySelectorAll('.edge path').forEach(p => {
                    p.style.strokeWidth = '2';
                    p.style.opacity = '0.7';
                    p.style.transition = 'opacity 0.4s ease, stroke 0.3s ease';
                });

                // Entry animation
                svgEl.style.opacity = '0';
                svgEl.style.transform = 'scale(0.96)';
                svgEl.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                requestAnimationFrame(() => {
                    svgEl.style.opacity = '1';
                    svgEl.style.transform = 'scale(1)';
                });
            }

            setSteps(data.steps || []);
            setRendered(true);

            // Auto-fit: center diagram in container
            setTimeout(() => {
                const s = box.querySelector('svg');
                const c = containerRef.current?.getBoundingClientRect();
                if (s && c) {
                    const w = s.scrollWidth || s.getBoundingClientRect().width || 800;
                    const h = s.scrollHeight || s.getBoundingClientRect().height || 600;
                    const idealZoom = Math.max(0.3, Math.min(Math.min((c.width - 40) / w, (c.height - 60) / h), 1.3));
                    // Center the scaled content
                    const scaledW = w * idealZoom;
                    const scaledH = h * idealZoom;
                    const cx = Math.max(0, (c.width - scaledW) / 2);
                    const cy = Math.max(0, (c.height - scaledH) / 2);
                    panRef.current = { x: cx, y: cy };
                    setZoom(idealZoom);
                }
            }, 250);
        } catch (e) {
            setError(e.message);
            console.error('Visualize error:', e);
        }
        setLoading(false);
    }, [activeFile, showStep]);

    /* ─── Pan handlers ─── */
    const onMD = useCallback(e => {
        if (e.target.closest('.node')) return;
        dragRef.current = { on: true, sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
    }, []);
    const onMM = useCallback(e => {
        if (!dragRef.current.on) return;
        panRef.current = { x: dragRef.current.px + e.clientX - dragRef.current.sx, y: dragRef.current.py + e.clientY - dragRef.current.sy };
        applyTx();
    }, [applyTx]);
    const onMU = useCallback(() => { dragRef.current.on = false; }, []);
    const onWh = useCallback(e => { e.preventDefault(); setZoom(z => Math.max(0.15, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1)))); }, []);

    /* ─── Fit ─── */
    const fitView = useCallback(() => {
        const s = svgBoxRef.current?.querySelector('svg');
        const c = containerRef.current;
        if (!s || !c) return;
        const cr = c.getBoundingClientRect();
        const w = s.scrollWidth || s.getBoundingClientRect().width || 800;
        const h = s.scrollHeight || s.getBoundingClientRect().height || 600;
        const ideal = Math.max(0.3, Math.min(Math.min((cr.width - 40) / w, (cr.height - 60) / h), 1.3));
        const scaledW = w * ideal;
        const scaledH = h * ideal;
        panRef.current = { x: Math.max(0, (cr.width - scaledW) / 2), y: Math.max(0, (cr.height - scaledH) / 2) };
        setZoom(ideal);
    }, []);

    /* ─── Empty state ─── */
    if (!activeFile) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-title">Code Visualizer</div>
                <div className="empty-state-text">Open a Python file to visualize its execution flow.</div>
            </div>
        );
    }

    const stepInfo = currentStep >= 0 && steps[currentStep]
        ? steps[currentStep]
        : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* ─── Toolbar ─── */}
            <div className="viz-controls">
                <button className="btn btn-primary" onClick={loadFlow} disabled={loading}
                    style={{ fontSize: 11, padding: '4px 14px', gap: 4 }}>
                    <Eye size={12} /> {loading ? 'Analyzing…' : 'Visualize'}
                </button>
                <div className="viz-divider" />

                {rendered && (
                    <>
                        <button className="btn-icon" onClick={handlePlay}
                            title={playing ? 'Pause' : 'Play walkthrough'}
                            style={{ color: playing ? '#f85149' : '#3fb950' }}>
                            {playing ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button className="btn-icon" onClick={handleStep} title="Next step">
                            <SkipForward size={13} />
                        </button>
                        <button className="btn-icon" onClick={handleReset} title="Reset">
                            <RotateCcw size={13} />
                        </button>
                        <div className="viz-divider" />

                        {/* Speed slider */}
                        <span style={{ fontSize: 10, color: '#6e7681', whiteSpace: 'nowrap' }}>Speed</span>
                        <input type="range" min="200" max="2000" step="100"
                            value={2200 - speed} onChange={e => setSpeed(2200 - Number(e.target.value))}
                            style={{ width: 60, height: 3, accentColor: '#58a6ff' }}
                            title={`${speed}ms per step`} />
                        <div className="viz-divider" />
                    </>
                )}

                <button className="btn-icon" onClick={() => setZoom(z => Math.min(3, z * 1.25))}><ZoomIn size={13} /></button>
                <button className="btn-icon" onClick={() => setZoom(z => Math.max(0.2, z * 0.8))}><ZoomOut size={13} /></button>
                <button className="btn-icon" onClick={fitView}><Maximize size={13} /></button>

                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {rendered && `${Math.round(zoom * 100)}%`} {activeFile?.split('/').pop()}
                </span>
            </div>

            {/* ─── Step info bar ─── */}
            {stepInfo && (
                <div style={{
                    padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 10,
                    background: '#161b22', borderBottom: '1px solid #21262d', fontSize: 12,
                }}>
                    <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: (GLOW[`${stepInfo.kind}Style`] || DEFAULT_GLOW).color,
                        boxShadow: (GLOW[`${stepInfo.kind}Style`] || DEFAULT_GLOW).shadow,
                    }} />
                    <span style={{ color: '#e6edf3', fontWeight: 600 }}>
                        Step {currentStep + 1}/{steps.length}
                    </span>
                    <span style={{ color: '#8b949e' }}>—</span>
                    <span style={{ color: (GLOW[`${stepInfo.kind}Style`] || DEFAULT_GLOW).color, fontWeight: 500 }}>
                        {stepInfo.kind}
                    </span>
                    <span style={{ color: '#e6edf3' }}>{stepInfo.label}</span>
                    {stepInfo.line > 0 && (
                        <span style={{ color: '#484f58', fontSize: 11 }}>Line {stepInfo.line}</span>
                    )}
                </div>
            )}

            {error && (
                <div style={{ padding: '6px 12px', background: '#f8514918', color: '#f85149', fontSize: 11, borderBottom: '1px solid #30363d' }}>
                    ⚠️ {error}
                </div>
            )}

            {/* ─── Diagram ─── */}
            <div ref={containerRef}
                style={{
                    flex: 1, overflow: 'hidden', position: 'relative',
                    cursor: dragRef.current?.on ? 'grabbing' : 'grab', background: '#0d1117',
                }}
                onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU}
                onMouseLeave={onMU} onWheel={onWh}
            >
                <div ref={svgBoxRef}
                    style={{
                        transformOrigin: '0 0',
                        transition: dragRef.current?.on ? 'none' : 'transform 0.15s ease',
                        display: 'inline-block',
                    }}
                />

                {!rendered && !loading && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', color: '#484f58', gap: 12,
                    }}>
                        <div style={{ fontSize: 44, filter: 'grayscale(0.5)' }}>🔬</div>
                        <div style={{ fontSize: 14 }}>
                            Click <strong style={{ color: '#58a6ff' }}>Visualize</strong> to trace code execution
                        </div>
                        <div style={{ fontSize: 11, color: '#30363d', maxWidth: 260, textAlign: 'center' }}>
                            Generates a flowchart, then use ▶ Play to watch the code execute step by step
                        </div>
                    </div>
                )}

                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', background: '#0d111799',
                    }}>
                        <div className="loading-spinner" style={{ width: 32, height: 32 }} />
                    </div>
                )}
            </div>

            {/* ─── Legend + progress ─── */}
            {rendered && (
                <div style={{
                    display: 'flex', gap: 10, padding: '4px 10px', alignItems: 'center',
                    borderTop: '1px solid var(--border-primary)', fontSize: 10,
                    color: '#6e7681', flexWrap: 'wrap', background: 'var(--bg-surface)',
                }}>
                    <span><b style={{ color: '#bc8cff' }}>●</b> Func</span>
                    <span><b style={{ color: '#d29922' }}>◆</b> Cond</span>
                    <span><b style={{ color: '#3fb950' }}>●</b> Call</span>
                    <span><b style={{ color: '#39d2c0' }}>●</b> Import</span>
                    <span><b style={{ color: '#f778ba' }}>●</b> Loop</span>
                    <span><b style={{ color: '#f85149' }}>●</b> Return</span>
                    <span style={{ flex: 1 }} />
                    {/* Mini progress bar */}
                    {steps.length > 0 && (
                        <div style={{
                            width: 80, height: 3, borderRadius: 2, background: '#21262d', overflow: 'hidden',
                        }}>
                            <div style={{
                                width: `${((currentStep + 1) / steps.length) * 100}%`,
                                height: '100%', background: '#58a6ff', borderRadius: 2,
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                    )}
                    <span>Scroll zoom · Drag pan ·  Click node to jump</span>
                </div>
            )}

            {/* CSS animation for flow pulse */}
            <style>{`
        @keyframes flowPulse {
          from { stroke-dashoffset: 12; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>
        </div>
    );
}
