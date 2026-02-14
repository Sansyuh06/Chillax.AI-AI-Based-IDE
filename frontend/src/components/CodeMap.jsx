import React, { useRef, useEffect, useCallback, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut, Play } from 'lucide-react';

/* ────────────────────────── EASING ────────────────────────── */
const ease = {
    outCubic: t => 1 - (1 - t) ** 3,
    outElastic: t => {
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
    },
    outBack: t => { const c = 2.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
};
const lerp = (a, b, t) => a + (b - a) * t;

/* ────────────────────────── PARTICLES ────────────────────────── */
class Particle {
    constructor(x, y, color, vx, vy, life, size) {
        Object.assign(this, { x, y, color, vx, vy, life, maxLife: life, size, alive: true });
    }
    update(dt) {
        this.x += this.vx * dt * 60; this.y += this.vy * dt * 60;
        this.life -= dt; if (this.life <= 0) this.alive = false;
    }
    draw(ctx) {
        if (!this.alive) return;
        const a = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, Math.max(0.5, this.size * a), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class Particles {
    constructor() { this.list = []; }
    emit(x, y, c, n = 4, s = 2, l = 0.5, sz = 2) {
        for (let i = 0; i < n; i++)
            this.list.push(new Particle(x, y, c, (Math.random() - .5) * s * 2, (Math.random() - .5) * s * 2, l + Math.random() * .2, sz));
    }
    update(dt) { this.list = this.list.filter(p => p.alive); this.list.forEach(p => p.update(dt)); }
    draw(ctx) { this.list.forEach(p => p.draw(ctx)); }
}

/* ────────────────────── NODE COLORS ────────────────────── */
const NCOL = { module: '#58a6ff', function: '#bc8cff', class: '#d29922' };
const NICON = { module: 'M', function: 'ƒ', class: 'C' };

/* ────────────────────── GRAPH NODE ────────────────────── */
class GNode {
    constructor(id, label, type, x, y, delay, r = 22) {
        Object.assign(this, {
            id, label, type, color: NCOL[type] || '#58a6ff',
            tx: x, ty: y, x, y: y - 50,
            r, cr: 0, delay, t: 0, dur: 0.6,
            visible: false, hover: false, scale: 0, opacity: 0, pulse: Math.random() * 6,
        });
    }
    start() { this.visible = true; this.t = 0; }
    update(dt, mx, my) {
        if (!this.visible) return;
        this.t += dt;
        const p = Math.min(1, this.t / this.dur);
        this.y = lerp(this.ty - 50, this.ty, ease.outBack(p));
        this.x = this.tx;
        this.scale = ease.outElastic(p);
        this.cr = this.r * this.scale;
        this.opacity = Math.min(1, p * 3);
        this.pulse += dt * 2;
        const dx = mx - this.x, dy = my - this.y;
        this.hover = dx * dx + dy * dy <= (this.cr + 6) ** 2;
    }
    draw(ctx) {
        if (!this.visible || this.opacity < 0.01) return;
        const r = Math.max(1, this.cr), { x, y } = this;

        // Glow
        if (this.hover) {
            const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r + 16);
            g.addColorStop(0, this.color + '25'); g.addColorStop(1, this.color + '00');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r + 16, 0, Math.PI * 2); ctx.fill();
        }

        // Circle fill
        ctx.globalAlpha = this.opacity * 0.9;
        ctx.fillStyle = this.hover ? '#2d364a' : '#1c2333';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = this.color + (this.hover ? 'ff' : '88');
        ctx.lineWidth = 2; ctx.stroke();

        // Icon
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.font = `bold ${Math.max(10, r * 0.65 | 0)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(NICON[this.type] || '?', x, y);

        // Label
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#e6edf3';
        ctx.fillText(this.label, x, y + r + 12);
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#6e7681';
        ctx.fillText(this.type, x, y + r + 24);
        ctx.globalAlpha = 1;
    }
}

/* ────────────────────── GRAPH EDGE ────────────────────── */
class GEdge {
    constructor(src, tgt, label, color, delay) {
        Object.assign(this, { src, tgt, label, color: color || '#58a6ff', delay, t: 0, dur: 0.5, visible: false, progress: 0 });
    }
    start() { this.visible = true; this.t = 0; }
    update(dt) {
        if (!this.visible) return;
        this.t += dt;
        this.progress = Math.min(1, ease.outCubic(Math.min(1, this.t / this.dur)));
    }
    draw(ctx, particles) {
        if (!this.visible || this.progress < 0.01) return;
        const { src, tgt } = this;
        const sx = src.x, sy = src.y, ex = tgt.x, ey = tgt.y;

        // Offset start/end to node edges
        const angle = Math.atan2(ey - sy, ex - sx);
        const x1 = sx + Math.cos(angle) * src.cr;
        const y1 = sy + Math.sin(angle) * src.cr;
        const x2 = ex - Math.cos(angle) * tgt.cr;
        const y2 = ey - Math.sin(angle) * tgt.cr;

        const cx = lerp(x1, x2, this.progress);
        const cy = lerp(y1, y2, this.progress);

        ctx.globalAlpha = Math.min(1, this.progress * 2) * 0.6;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(cx, cy); ctx.stroke();

        // Arrow
        if (this.progress > 0.4) {
            const al = 8;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx - al * Math.cos(angle - 0.4), cy - al * Math.sin(angle - 0.4));
            ctx.lineTo(cx - al * Math.cos(angle + 0.4), cy - al * Math.sin(angle + 0.4));
            ctx.closePath(); ctx.fill();
        }

        // Particles at tip
        if (this.progress > 0.1 && this.progress < 0.9 && Math.random() < 0.2)
            particles.emit(cx, cy, this.color, 1, 1, 0.3, 1.5);

        ctx.globalAlpha = 1;
    }
}

/* ────────────────────── FORCE-DIRECTED LAYOUT ────────────────────── */
function forceLayout(graph, W, H) {
    const nodes = [], edges = [], nodeMap = {};
    if (!graph?.modules) return { nodes, edges };

    const mods = graph.modules;
    const gEdges = graph.edges || [];

    // 1. Create module nodes with initial positions in a circle
    const cx = W / 2, cy = H / 2;
    const baseR = Math.min(W, H) * 0.32;

    mods.forEach((mod, i) => {
        const angle = (i / mods.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * baseR;
        const y = cy + Math.sin(angle) * baseR;
        const n = new GNode(mod.module, mod.module.split('/').pop().replace('.py', ''), 'module', x, y, i * 0.1, 24);
        nodes.push(n);
        nodeMap[mod.module] = n;
    });

    // 2. Create child nodes (max 3 per module) orbiting their parent
    mods.forEach((mod, i) => {
        const parent = nodeMap[mod.module];
        const children = [
            ...(mod.functions || []).slice(0, 2).map(f => ({ name: f.name, type: 'function' })),
            ...(mod.classes || []).slice(0, 1).map(c => ({ name: c.name, type: 'class' })),
        ];
        children.forEach((ch, j) => {
            const a = (j / Math.max(children.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const or = 50;
            const fx = parent.tx + Math.cos(a) * or;
            const fy = parent.ty + Math.sin(a) * or;
            const cn = new GNode(`${mod.module}::${ch.name}`, ch.name, ch.type, fx, fy, i * 0.1 + (j + 1) * 0.06, 14);
            nodes.push(cn);
            nodeMap[`${mod.module}::${ch.name}`] = cn;
            edges.push(new GEdge(parent, cn, '', '#30363d55', i * 0.1 + (j + 1) * 0.08));
        });
    });

    // 3. Run simple force simulation to spread nodes
    const positions = nodes.map(n => ({ x: n.tx, y: n.ty }));
    const REPULSION = 3000;
    const SPRING = 0.005;
    const DAMPING = 0.85;
    const velocities = nodes.map(() => ({ x: 0, y: 0 }));

    for (let iter = 0; iter < 80; iter++) {
        // Repulsion between all nodes
        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                let dx = positions[i].x - positions[j].x;
                let dy = positions[i].y - positions[j].y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                let minDist = (nodes[i].r + nodes[j].r) * 2.5;
                if (dist < minDist) dist = minDist;
                const force = REPULSION / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                velocities[i].x += fx; velocities[i].y += fy;
                velocities[j].x -= fx; velocities[j].y -= fy;
            }
        }

        // Spring attraction to keep connected nodes together (but not too close)
        edges.forEach(e => {
            const si = nodes.indexOf(e.src), ti = nodes.indexOf(e.tgt);
            if (si < 0 || ti < 0) return;
            const dx = positions[ti].x - positions[si].x;
            const dy = positions[ti].y - positions[si].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = 70;
            const force = (dist - targetDist) * SPRING;
            velocities[si].x += (dx / dist) * force;
            velocities[si].y += (dy / dist) * force;
            velocities[ti].x -= (dx / dist) * force;
            velocities[ti].y -= (dy / dist) * force;
        });

        // Center gravity
        for (let i = 0; i < positions.length; i++) {
            velocities[i].x += (cx - positions[i].x) * 0.001;
            velocities[i].y += (cy - positions[i].y) * 0.001;
        }

        // Apply velocities
        for (let i = 0; i < positions.length; i++) {
            velocities[i].x *= DAMPING;
            velocities[i].y *= DAMPING;
            positions[i].x += velocities[i].x;
            positions[i].y += velocities[i].y;
            // Keep in bounds
            const margin = 40;
            positions[i].x = Math.max(margin, Math.min(W - margin, positions[i].x));
            positions[i].y = Math.max(margin, Math.min(H - margin, positions[i].y));
        }
    }

    // Apply final positions
    nodes.forEach((n, i) => { n.tx = positions[i].x; n.ty = positions[i].y; n.x = n.tx; n.y = n.ty - 50; });

    // 4. Cross-module edges
    gEdges.forEach((e, i) => {
        const s = nodeMap[e.source], t = nodeMap[e.target];
        if (s && t) edges.push(new GEdge(s, t, 'imports', '#39d2c0', mods.length * 0.1 + i * 0.12));
    });

    return { nodes, edges };
}

/* ────────────────────── REACT COMPONENT ────────────────────── */
export default function CodeMap({ graph, onFileSelect, onFunctionClick }) {
    const canvasRef = useRef(null);
    const state = useRef({ nodes: [], edges: [], particles: new Particles(), pan: { x: 0, y: 0 }, zoom: 1, dragging: false, dragStart: { x: 0, y: 0 }, panStart: { x: 0, y: 0 }, _mouse: { x: -999, y: -999 } });
    const raf = useRef(null);
    const lastT = useRef(null);

    // Build graph
    useEffect(() => {
        if (!graph || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const { nodes, edges } = forceLayout(graph, rect.width, rect.height);
        const s = state.current;
        s.nodes = nodes; s.edges = edges;
        s.particles = new Particles();
        s.pan = { x: 0, y: 0 }; s.zoom = 1;

        // Stagger start
        nodes.forEach(n => setTimeout(() => { n.start(); s.particles.emit(n.tx, n.ty, n.color, 5, 2.5, 0.4, 2.5); }, n.delay * 1000));
        edges.forEach(e => setTimeout(() => e.start(), e.delay * 1000 + 300));
    }, [graph]);

    // Render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const resize = () => {
            const r = canvas.getBoundingClientRect();
            const d = window.devicePixelRatio || 1;
            canvas.width = r.width * d; canvas.height = r.height * d;
            ctx.setTransform(d, 0, 0, d, 0, 0);
        };
        resize();
        const ro = new ResizeObserver(resize); ro.observe(canvas);

        const tick = (ts) => {
            const now = ts / 1000;
            const dt = lastT.current ? Math.min(now - lastT.current, 0.05) : 0.016;
            lastT.current = now;
            const s = state.current;
            const rect = canvas.getBoundingClientRect();
            const w = rect.width, h = rect.height;
            const wmx = (s._mouse.x - s.pan.x) / s.zoom;
            const wmy = (s._mouse.y - s.pan.y) / s.zoom;

            s.nodes.forEach(n => n.update(dt, wmx, wmy));
            s.edges.forEach(e => e.update(dt));
            s.particles.update(dt);

            // Clear
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, w, h);

            // Grid
            ctx.globalAlpha = 0.04; ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
            const gs = 40 * s.zoom;
            for (let gx = s.pan.x % gs; gx < w; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
            for (let gy = s.pan.y % gs; gy < h; gy += gs) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
            ctx.globalAlpha = 1;

            ctx.save(); ctx.translate(s.pan.x, s.pan.y); ctx.scale(s.zoom, s.zoom);
            s.edges.forEach(e => e.draw(ctx, s.particles));
            s.nodes.forEach(n => n.draw(ctx));
            s.particles.draw(ctx);
            ctx.restore();

            // HUD
            if (graph) {
                ctx.fillStyle = '#6e7681'; ctx.font = '10px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`${graph.stats?.total_modules || 0} modules · ${graph.stats?.total_functions || 0} functions · ${graph.stats?.total_classes || 0} classes`, w - 10, h - 6);
                ctx.textAlign = 'left';
                ctx.fillText('Scroll to zoom · Drag to pan · Click node to open file', 10, h - 6);
            }

            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf.current); ro.disconnect(); };
    }, [graph]);

    const onMove = useCallback(e => {
        const r = canvasRef.current?.getBoundingClientRect(); if (!r) return;
        const s = state.current;
        s._mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
        if (s.dragging) { s.pan.x = s.panStart.x + (e.clientX - s.dragStart.x); s.pan.y = s.panStart.y + (e.clientY - s.dragStart.y); }
    }, []);

    const onDown = useCallback(e => {
        const s = state.current; s.dragging = true;
        s.dragStart = { x: e.clientX, y: e.clientY }; s.panStart = { ...s.pan };
    }, []);

    const onUp = useCallback(e => {
        const s = state.current;
        const moved = Math.abs(e.clientX - s.dragStart.x) + Math.abs(e.clientY - s.dragStart.y);
        s.dragging = false;
        if (moved < 5) {
            const r = canvasRef.current?.getBoundingClientRect(); if (!r) return;
            const wx = (e.clientX - r.left - s.pan.x) / s.zoom;
            const wy = (e.clientY - r.top - s.pan.y) / s.zoom;
            for (const n of s.nodes) {
                if (!n.visible) continue;
                if ((wx - n.x) ** 2 + (wy - n.y) ** 2 <= (n.cr + 5) ** 2) {
                    if (n.type === 'module') onFileSelect?.(n.id);
                    else if (n.id.includes('::')) onFunctionClick?.(n.id.split('::')[0]);
                    s.particles.emit(n.x, n.y, n.color, 10, 3, 0.5, 3);
                    break;
                }
            }
        }
    }, [onFileSelect, onFunctionClick]);

    const onWheel = useCallback(e => {
        e.preventDefault();
        const s = state.current;
        const r = canvasRef.current?.getBoundingClientRect(); if (!r) return;
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const oz = s.zoom;
        s.zoom = Math.max(0.2, Math.min(4, s.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
        s.pan.x = mx - (mx - s.pan.x) * (s.zoom / oz);
        s.pan.y = my - (my - s.pan.y) * (s.zoom / oz);
    }, []);

    const reset = useCallback(() => { const s = state.current; s.pan = { x: 0, y: 0 }; s.zoom = 1; }, []);

    if (!graph) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🗺️</div>
                <div className="empty-state-title">Code Map</div>
                <div className="empty-state-text">
                    Click <strong>"Analyze Project"</strong> to generate an animated graph of your codebase.
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
                <button className="btn-icon" onClick={reset} title="Reset view"><RotateCcw size={13} /></button>
                <button className="btn-icon" onClick={() => { state.current.zoom = Math.min(4, state.current.zoom * 1.3); }} title="Zoom in"><ZoomIn size={13} /></button>
                <button className="btn-icon" onClick={() => { state.current.zoom = Math.max(0.2, state.current.zoom * 0.7); }} title="Zoom out"><ZoomOut size={13} /></button>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{graph.stats?.total_modules} modules</span>
            </div>
            <canvas ref={canvasRef} style={{ flex: 1, width: '100%', cursor: 'grab', display: 'block' }}
                onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onWheel={onWheel} />
        </div>
    );
}
