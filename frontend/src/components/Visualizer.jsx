import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eye, Maximize, ZoomIn, ZoomOut, Play, Pause, SkipForward, RotateCcw } from 'lucide-react';
import { visualizeFile } from '../api/client';

/* ─── Mermaid via CDN (window.mermaid) ─── */
let mermaidReady = false;
async function initMermaid() {
    if (mermaidReady && window.mermaid) return window.mermaid;
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
            primaryBorderColor: '#30363d', lineColor: '#58a6ff',
            secondaryColor: '#161b22', tertiaryColor: '#1c2333',
            fontFamily: '"Inter","Segoe UI",sans-serif', fontSize: '14px',
            nodeBorder: '#30363d', mainBkg: '#161b22',
        },
        flowchart: {
            htmlLabels: true, curve: 'basis',
            nodeSpacing: 50, rankSpacing: 65,
            padding: 20, useMaxWidth: false,
        },
        securityLevel: 'loose',
    });
    mermaidReady = true;
    return window.mermaid;
}

/* ─── Glow colors ─── */
const GLOW = {
    startStyle: { color: '#58a6ff', bg: '#58a6ff22' },
    defineStyle: { color: '#bc8cff', bg: '#bc8cff22' },
    callStyle: { color: '#3fb950', bg: '#3fb95022' },
    importStyle: { color: '#39d2c0', bg: '#39d2c022' },
    conditionStyle: { color: '#d29922', bg: '#d2992222' },
    loopStyle: { color: '#f778ba', bg: '#f778ba22' },
    returnStyle: { color: '#f85149', bg: '#f8514922' },
    classStyle: { color: '#d29922', bg: '#d2992222' },
    assignStyle: { color: '#8b949e', bg: '#8b949e22' },
};
const DEF_GLOW = { color: '#58a6ff', bg: '#58a6ff22' };

export default function Visualizer({ activeFile }) {
    const scrollRef = useRef(null);
    const svgRef = useRef(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rendered, setRendered] = useState(false);
    const [zoom, setZoom] = useState(1);

    // Animation
    const [steps, setSteps] = useState([]);
    const [curStep, setCurStep] = useState(-1);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(800);
    const playRef = useRef(false);
    const speedRef = useRef(800);
    const stepsRef = useRef([]);

    useEffect(() => { speedRef.current = speed; }, [speed]);
    useEffect(() => { stepsRef.current = steps; }, [steps]);

    /* ─────── Highlight helpers ─────── */
    const dimAll = useCallback(() => {
        const svg = svgRef.current?.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('.node').forEach(n => {
            n.style.opacity = '0.2';
            n.style.filter = 'none';
            n.style.transition = 'all 0.4s ease';
        });
        svg.querySelectorAll('.edge path, .edge polygon, .edge marker').forEach(p => {
            p.style.opacity = '0.08';
            p.style.transition = 'all 0.4s ease';
        });
    }, []);

    const resetAll = useCallback(() => {
        const svg = svgRef.current?.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('.node').forEach(n => {
            n.style.opacity = '1';
            n.style.filter = 'none';
            n.style.transition = 'all 0.35s ease';
        });
        svg.querySelectorAll('.edge path, .edge polygon').forEach(p => {
            p.style.opacity = '0.7';
            p.style.stroke = '';
            p.style.strokeWidth = '';
            p.style.strokeDasharray = '';
            p.style.animation = '';
            p.style.transition = 'all 0.35s ease';
        });
    }, []);

    const glowNode = useCallback((sid, kind) => {
        const svg = svgRef.current?.querySelector('svg');
        if (!svg) return;
        const n = svg.querySelector(`[id*="flowchart-${sid}-"]`);
        if (!n) return;
        const g = GLOW[`${kind}Style`] || DEF_GLOW;
        n.style.opacity = '1';
        n.style.filter = `drop-shadow(0 0 14px ${g.color}88) brightness(1.4)`;
        n.style.transition = 'all 0.3s ease';
    }, []);

    const glowEdge = useCallback((fromSid, toSid) => {
        const svg = svgRef.current?.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('.edge').forEach(edge => {
            const eid = edge.id || '';
            if (eid.includes(fromSid) && eid.includes(toSid)) {
                edge.querySelectorAll('path, polygon').forEach(p => {
                    p.style.opacity = '1';
                    p.style.stroke = '#58a6ff';
                    p.style.strokeWidth = '3';
                    p.style.strokeDasharray = '8 4';
                    p.style.animation = 'edgeFlow 0.6s linear infinite';
                });
            }
        });
    }, []);

    /* ─────── Show step ─────── */
    const showStep = useCallback((idx) => {
        const all = stepsRef.current;
        if (idx < 0 || idx >= all.length) return;
        dimAll();

        // Highlight trail up to current step
        for (let i = 0; i <= idx; i++) {
            const s = all[i];
            const svg = svgRef.current?.querySelector('svg');
            if (!svg) continue;
            const n = svg.querySelector(`[id*="flowchart-${s.sid}-"]`);
            if (n) {
                n.style.opacity = i === idx ? '1' : '0.5';
                if (i === idx) glowNode(s.sid, s.kind);
            }
            if (s.parent) {
                const ps = all.find(x => x.id === s.parent);
                if (ps) glowEdge(ps.sid, s.sid);
            }
        }
        setCurStep(idx);

        // Scroll the active node into view
        const svg = svgRef.current?.querySelector('svg');
        const activeNode = svg?.querySelector(`[id*="flowchart-${all[idx].sid}-"]`);
        if (activeNode && scrollRef.current) {
            const nr = activeNode.getBoundingClientRect();
            const sr = scrollRef.current.getBoundingClientRect();
            if (nr.bottom > sr.bottom || nr.top < sr.top || nr.right > sr.right || nr.left < sr.left) {
                activeNode.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
        }
    }, [dimAll, glowNode, glowEdge]);

    /* ─────── Playback ─────── */
    const playLoop = useCallback(async (start) => {
        playRef.current = true;
        let i = start;
        while (playRef.current && i < stepsRef.current.length) {
            showStep(i);
            i++;
            await new Promise(r => setTimeout(r, speedRef.current));
        }
        if (i >= stepsRef.current.length) { playRef.current = false; setPlaying(false); }
    }, [showStep]);

    const togglePlay = useCallback(() => {
        if (playing) { playRef.current = false; setPlaying(false); }
        else { setPlaying(true); playLoop(curStep >= steps.length - 1 ? 0 : curStep + 1); }
    }, [playing, curStep, steps.length, playLoop]);

    const stepFwd = useCallback(() => {
        playRef.current = false; setPlaying(false);
        if (curStep + 1 < steps.length) showStep(curStep + 1);
    }, [curStep, steps.length, showStep]);

    const reset = useCallback(() => {
        playRef.current = false; setPlaying(false); setCurStep(-1); resetAll();
    }, [resetAll]);

    /* ─────── Zoom helpers ─────── */
    const zoomIn = () => setZoom(z => Math.min(3, +(z + 0.2).toFixed(1)));
    const zoomOut = () => setZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1)));

    const fitView = useCallback(() => {
        const svg = svgRef.current?.querySelector('svg');
        const cont = scrollRef.current;
        if (!svg || !cont) return;
        const cr = cont.getBoundingClientRect();
        const bbox = svg.getBBox();
        const w = bbox.width || svg.scrollWidth || 800;
        const h = bbox.height || svg.scrollHeight || 600;
        const ideal = Math.max(0.3, Math.min(Math.min((cr.width - 20) / w, (cr.height - 20) / h), 1.5));
        setZoom(ideal);
        // Scroll to center after zoom applies
        setTimeout(() => {
            cont.scrollTo({
                left: (cont.scrollWidth - cont.clientWidth) / 2,
                top: 0,
                behavior: 'smooth'
            });
        }, 50);
    }, []);

    /* ─────── Load & Render ─────── */
    const loadFlow = useCallback(async () => {
        if (!activeFile) return;
        setLoading(true); setError(null); setRendered(false);
        setCurStep(-1); setPlaying(false); playRef.current = false;

        try {
            const data = await visualizeFile(activeFile);
            if (!data.mermaid) throw new Error('No diagram data');

            const merm = await initMermaid();
            const box = svgRef.current;
            if (!box) return;
            box.innerHTML = '';

            const { svg } = await merm.render(`mmd${Date.now()}`, data.mermaid);
            box.innerHTML = svg;

            const svgEl = box.querySelector('svg');
            if (svgEl) {
                svgEl.style.display = 'block';
                svgEl.style.margin = '20px auto';
                svgEl.style.maxWidth = 'none';

                // Make nodes interactive
                svgEl.querySelectorAll('.node').forEach(node => {
                    node.style.cursor = 'pointer';
                    node.style.transition = 'all 0.35s ease';
                    node.addEventListener('mouseenter', () => {
                        if (curStep < 0) node.style.filter = 'brightness(1.3) drop-shadow(0 0 8px #58a6ff55)';
                    });
                    node.addEventListener('mouseleave', () => {
                        if (curStep < 0) node.style.filter = 'none';
                    });
                    node.addEventListener('click', () => {
                        const nid = node.id || '';
                        const idx = data.steps.findIndex(s => nid.includes(`flowchart-${s.sid}-`));
                        if (idx >= 0) showStep(idx);
                    });
                });

                // Style edges
                svgEl.querySelectorAll('.edge path').forEach(p => {
                    p.style.strokeWidth = '2';
                    p.style.opacity = '0.7';
                });

                // Entry fade
                svgEl.style.opacity = '0';
                svgEl.style.transition = 'opacity 0.6s ease';
                requestAnimationFrame(() => { svgEl.style.opacity = '1'; });
            }

            setSteps(data.steps || []);
            setRendered(true);

            // Auto-fit after SVG renders
            setTimeout(() => {
                const cont = scrollRef.current;
                const s2 = box.querySelector('svg');
                if (cont && s2) {
                    const cr = cont.getBoundingClientRect();
                    const bbox = s2.getBBox();
                    const w = bbox.width || s2.scrollWidth || 800;
                    const h = bbox.height || s2.scrollHeight || 600;
                    const ideal = Math.max(0.3, Math.min(Math.min((cr.width - 20) / w, (cr.height - 20) / h), 1.5));
                    setZoom(ideal);
                    setTimeout(() => {
                        cont.scrollTo({
                            left: (cont.scrollWidth - cont.clientWidth) / 2,
                            top: 0,
                        });
                    }, 50);
                }
            }, 300);
        } catch (e) {
            setError(e.message);
            console.error('Visualize error:', e);
        }
        setLoading(false);
    }, [activeFile, showStep, curStep]);

    /* ─── Wheel zoom ─── */
    const onWheel = useCallback(e => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom(z => Math.max(0.3, Math.min(3, +(z + (e.deltaY > 0 ? -0.1 : 0.1)).toFixed(1))));
        }
    }, []);

    /* ─── Empty state ─── */
    if (!activeFile) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🔬</div>
                <div className="empty-state-title">Code Visualizer</div>
                <div className="empty-state-text">Open a Python file to visualize its execution flow.</div>
            </div>
        );
    }

    const si = curStep >= 0 && steps[curStep] ? steps[curStep] : null;
    const glow = si ? (GLOW[`${si.kind}Style`] || DEF_GLOW) : DEF_GLOW;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* ── Toolbar ── */}
            <div className="viz-controls">
                <button className="btn btn-primary" onClick={loadFlow} disabled={loading}
                    style={{ fontSize: 11, padding: '4px 14px', gap: 4 }}>
                    <Eye size={12} /> {loading ? 'Analyzing…' : 'Visualize'}
                </button>
                <div className="viz-divider" />

                {rendered && <>
                    <button className="btn-icon" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}
                        style={{ color: playing ? '#f85149' : '#3fb950' }}>
                        {playing ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button className="btn-icon" onClick={stepFwd} title="Next step"><SkipForward size={13} /></button>
                    <button className="btn-icon" onClick={reset} title="Reset"><RotateCcw size={13} /></button>
                    <div className="viz-divider" />
                    <span style={{ fontSize: 10, color: '#6e7681' }}>Speed</span>
                    <input type="range" min="200" max="2000" step="100"
                        value={2200 - speed} onChange={e => setSpeed(2200 - +e.target.value)}
                        style={{ width: 55, height: 3, accentColor: '#58a6ff' }} />
                    <div className="viz-divider" />
                </>}

                <button className="btn-icon" onClick={zoomIn} title="Zoom in"><ZoomIn size={13} /></button>
                <button className="btn-icon" onClick={zoomOut} title="Zoom out"><ZoomOut size={13} /></button>
                <button className="btn-icon" onClick={fitView} title="Fit"><Maximize size={13} /></button>

                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {rendered && `${Math.round(zoom * 100)}%`} {activeFile?.split('/').pop()}
                </span>
            </div>

            {/* ── Step info ── */}
            {si && (
                <div style={{
                    padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 10,
                    background: glow.bg, borderBottom: `2px solid ${glow.color}40`, fontSize: 12,
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: glow.color, boxShadow: `0 0 8px ${glow.color}`,
                        display: 'inline-block',
                    }} />
                    <b style={{ color: '#e6edf3' }}>Step {curStep + 1}/{steps.length}</b>
                    <span style={{ color: '#484f58' }}>│</span>
                    <span style={{ color: glow.color, fontWeight: 500 }}>{si.kind}</span>
                    <span style={{ color: '#e6edf3' }}>{si.label}</span>
                    {si.line > 0 && <span style={{ color: '#484f58' }}>L{si.line}</span>}
                </div>
            )}

            {error && (
                <div style={{ padding: '6px 12px', background: '#f8514918', color: '#f85149', fontSize: 11 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* ── Diagram container — NATIVE SCROLL ── */}
            <div
                ref={scrollRef}
                onWheel={onWheel}
                style={{
                    flex: 1, overflow: 'auto', background: '#0d1117',
                    position: 'relative',
                }}
            >
                <div
                    ref={svgRef}
                    style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top center',
                        transition: 'transform 0.2s ease',
                        minHeight: '100%',
                        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
                        padding: '20px 0',
                    }}
                />

                {!rendered && !loading && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', color: '#484f58', gap: 12,
                    }}>
                        <div style={{ fontSize: 44 }}>🔬</div>
                        <div style={{ fontSize: 14 }}>
                            Click <strong style={{ color: '#58a6ff' }}>Visualize</strong> to trace execution
                        </div>
                        <div style={{ fontSize: 11, color: '#30363d', maxWidth: 260, textAlign: 'center' }}>
                            Generates a flowchart → press ▶ Play for step-by-step walkthrough
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

            {/* ── Legend ── */}
            {rendered && (
                <div style={{
                    display: 'flex', gap: 10, padding: '4px 10px', alignItems: 'center',
                    borderTop: '1px solid var(--border-primary)', fontSize: 10,
                    color: '#6e7681', background: 'var(--bg-surface)',
                }}>
                    <span><b style={{ color: '#bc8cff' }}>●</b> Func</span>
                    <span><b style={{ color: '#d29922' }}>◆</b> Cond</span>
                    <span><b style={{ color: '#3fb950' }}>●</b> Call</span>
                    <span><b style={{ color: '#39d2c0' }}>●</b> Import</span>
                    <span><b style={{ color: '#f778ba' }}>●</b> Loop</span>
                    <span><b style={{ color: '#f85149' }}>●</b> Return</span>
                    <span style={{ flex: 1 }} />
                    {steps.length > 0 && (
                        <div style={{ width: 80, height: 3, borderRadius: 2, background: '#21262d', overflow: 'hidden' }}>
                            <div style={{
                                width: `${((curStep + 1) / steps.length) * 100}%`,
                                height: '100%', background: '#58a6ff', borderRadius: 2,
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                    )}
                    <span>Ctrl+Scroll zoom · Scroll pan · Click node</span>
                </div>
            )}

            <style>{`
        @keyframes edgeFlow {
          from { stroke-dashoffset: 12; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>
        </div>
    );
}
