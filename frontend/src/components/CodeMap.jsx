import React, { useCallback, useMemo, useEffect, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  Panel,
  getOutgoers,
  getIncomers
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Search, Info, X, Layout, Maximize, Cpu, Flame, Ghost, Bug } from 'lucide-react';
import { explainCode } from '../api/client';

/* --- CUSTOM NODES (MEMOIZED) --- */

const renderBadges = (data) => {
  if (data.bugs && data.bugs.length > 0) {
    return <div className="bug-badge" title={data.bugs.join(', ')}>{data.bugs.length}</div>;
  }
  return null;
};

const getClassNames = (data) => {
  let classes = data.dimmed ? 'dimmed ' : '';
  if (data.heatmapClass) classes += ` ${data.heatmapClass}`;
  if (data.deadCodeClass) classes += ` ${data.deadCodeClass}`;
  return classes.trim();
};

const getOpacity = (data) => {
  if (data.dimmed || data.deadCodeClass === 'node-alive') return 0.2;
  return 1;
};

const ModuleNode = React.memo(({ data }) => (
  <div className={`rf-node-module ${getClassNames(data)}`} style={{ opacity: getOpacity(data) }}>
    {renderBadges(data)}
    <Handle type="target" position={Position.Top} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--accent-purple)' }}>📦</span>
      {data.label}
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
));

const ClassNode = React.memo(({ data }) => (
  <div className={`rf-node-class ${getClassNames(data)}`} style={{ opacity: getOpacity(data) }}>
    {renderBadges(data)}
    <Handle type="target" position={Position.Top} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--accent-cyan)' }}>C</span>
      {data.label}
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
));

const FunctionNode = React.memo(({ data }) => (
  <div className={`rf-node-function ${getClassNames(data)}`} style={{ opacity: getOpacity(data) }}>
    {renderBadges(data)}
    <Handle type="target" position={Position.Top} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--accent-green)' }}>ƒ</span>
      {data.label}
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
));

const nodeTypes = {
  module: ModuleNode,
  class: ClassNode,
  function: FunctionNode,
};

/* --- DAGRE LAYOUT --- */
const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 120 });

  nodes.forEach((node) => {
    const width = node.type === 'module' ? 180 : (node.type === 'class' ? 140 : 120);
    const height = 40;
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = direction === 'TB' ? Position.Top : Position.Left;
    node.sourcePosition = direction === 'TB' ? Position.Bottom : Position.Right;
    node.position = {
      x: nodeWithPosition.x - nodeWithPosition.width / 2,
      y: nodeWithPosition.y - nodeWithPosition.height / 2,
    };
    return node;
  });

  return { nodes, edges };
};

/* --- MAIN COMPONENT --- */
export default function CodeMap({ graph, onFileSelect, onFunctionClick, onAskAI }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeData, setSelectedNodeData] = useState(null);

  // Toggles
  const [heatmap, setHeatmap] = useState(false);
  const [deadCode, setDeadCode] = useState(false);
  const [bugScanner, setBugScanner] = useState(false);

  // Initialize nodes without styling filters
  const [rawNodes, setRawNodes] = useState([]);

  // Re-build graph when backend data changes
  useEffect(() => {
    if (!graph || !graph.modules) return;

    const newNodes = [];
    const newEdges = [];
    const nodeMap = new Set();

    // 1. Create nodes
    graph.modules.forEach((mod) => {
      const modId = mod.module;
      const modName = modId.split('/').pop();
      nodeMap.add(modId);
      newNodes.push({
        id: modId,
        type: 'module',
        position: { x: 0, y: 0 },
        data: { label: modName, fullPath: modId, rawType: 'Module', details: mod },
      });

      // Child classes
      (mod.classes || []).forEach((cls) => {
        const clsId = `${modId}::${cls.name}`;
        nodeMap.add(clsId);
        newNodes.push({
          id: clsId,
          type: 'class',
          position: { x: 0, y: 0 },
          data: { label: cls.name, fullPath: modId, parent: modId, rawType: 'Class', details: cls },
        });
        newEdges.push({
          id: `e-${modId}-${clsId}`,
          source: modId,
          target: clsId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'var(--border-accent)', strokeWidth: 1 }
        });
      });

      // Child functions
      (mod.functions || []).forEach((fn) => {
        const fnId = `${modId}::${fn.name}`;
        nodeMap.add(fnId);
        newNodes.push({
          id: fnId,
          type: 'function',
          position: { x: 0, y: 0 },
          data: { label: fn.name, fullPath: modId, parent: modId, rawType: 'Function', details: fn },
        });
        newEdges.push({
          id: `e-${modId}-${fnId}`,
          source: modId,
          target: fnId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'var(--border-accent)', strokeWidth: 1 }
        });
      });
    });

    // 2. Create interactive edges (imports/calls)
    (graph.edges || []).forEach((edgeData, i) => {
      if (nodeMap.has(edgeData.source) && nodeMap.has(edgeData.target)) {
        newEdges.push({
          id: `r-${i}`,
          source: edgeData.source,
          target: edgeData.target,
          type: 'default',
          animated: true,
          label: edgeData.label,
          labelStyle: { fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' },
          labelBgStyle: { fill: 'var(--bg-surface)', fillOpacity: 0.8 },
          style: { stroke: 'var(--accent-base)', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: 'var(--accent-base)' },
        });
      }
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges);
    setRawNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [graph, setEdges]);

  // Apply filters/toggles (Search, Heatmap, Dead Code, Bugs)
  useEffect(() => {
    if (!rawNodes.length) return;

    setNodes((nds) => {
      // For initial load, map rawNodes directly if nds is empty. Otherwise apply updates to current nds to preserve positions
      const baseNodes = nds.length === rawNodes.length ? nds : rawNodes;
      
      return baseNodes.map((n) => {
        const details = n.data.details;
        const match = searchQuery === '' || n.data.label.toLowerCase().includes(searchQuery.toLowerCase());
        
        let heatmapClass = null;
        if (heatmap && details) {
          const inDegree = details.in_degree || 0;
          if (inDegree > 5) heatmapClass = 'node-heatmap-hot';
          else if (inDegree > 2) heatmapClass = 'node-heatmap-warm';
          else heatmapClass = 'node-heatmap-cool';
        }

        let deadCodeClass = null;
        if (deadCode && details) {
          if (details.is_dead) deadCodeClass = 'node-dead-code';
          else deadCodeClass = 'node-alive'; // dims to background
        }

        let bugs = [];
        if (bugScanner && details && details.issues?.length > 0) {
          bugs = details.issues;
        }

        return {
          ...n,
          data: { 
            ...n.data, 
            dimmed: !match,
            heatmapClass,
            deadCodeClass,
            bugs
          }
        };
      });
    });
  }, [rawNodes, searchQuery, heatmap, deadCode, bugScanner, setNodes]);

  const onNodeClick = useCallback((event, node) => {
    const incomers = getIncomers(node, rawNodes, edges).map(n => n.data.label);
    const outgoers = getOutgoers(node, rawNodes, edges).map(n => n.data.label);
    setSelectedNodeData({ ...node.data, incomers, outgoers });
  }, [rawNodes, edges]);

  const handleAskAI = useCallback(() => {
    if (onAskAI && selectedNodeData) {
      onAskAI(`Analyze ${selectedNodeData.label} (${selectedNodeData.rawType}). Provide insights on its architecture and any code smells.`);
    }
  }, [onAskAI, selectedNodeData]);

  if (!graph) return null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={4}
        className="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={40} size={1} color="var(--border-accent)" />
        <MiniMap 
          nodeColor={(n) => {
            if (n.data.deadCodeClass === 'node-dead-code') return '#EF4444';
            if (n.type === 'module') return '#8B5CF6';
            if (n.type === 'class') return '#22D3EE';
            return '#10B981';
          }}
          maskColor="rgba(10, 10, 15, 0.7)"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-primary)' }}
        />
        <Controls />

        {/* Top Center: Search */}
        <Panel position="top-center">
          <div className="graph-search-bar animate-slide-in-up" style={{ marginTop: 12 }}>
            <Search size={14} color="var(--text-muted)" />
            <input 
              className="graph-search-input" 
              placeholder="Filter nodes..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </Panel>

        {/* Bottom Center: Insight Toggles */}
        <Panel position="bottom-center">
          <div className="insight-toggles animate-slide-in-up" style={{ marginBottom: 16 }}>
            <button className={`insight-toggle heatmap ${heatmap ? 'active' : ''}`} onClick={() => setHeatmap(!heatmap)} title="Color nodes by dependency count">
              <Flame size={14} color={heatmap ? "var(--accent-orange)" : "currentColor"} /> Heatmap
            </button>
            <button className={`insight-toggle deadcode ${deadCode ? 'active' : ''}`} onClick={() => setDeadCode(!deadCode)} title="Highlight unused functions">
              <Ghost size={14} color={deadCode ? "var(--accent-red)" : "currentColor"} /> Dead Code
            </button>
            <button className={`insight-toggle bugs ${bugScanner ? 'active' : ''}`} onClick={() => setBugScanner(!bugScanner)} title="Flag AST anti-patterns">
              <Bug size={14} color={bugScanner ? "var(--accent-purple)" : "currentColor"} /> Bug Scanner
            </button>
          </div>
        </Panel>

        {/* Top Right: Layout control */}
        <Panel position="top-right">
          <div className="glass-panel" style={{ padding: 8, borderRadius: 12, display: 'flex', gap: 6 }}>
            <button className="btn-icon" title="Auto Layout" onClick={() => {
              const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges);
              setNodes([...layoutedNodes]);
              setEdges([...layoutedEdges]);
            }}>
              <Layout size={16} />
            </button>
          </div>
        </Panel>
      </ReactFlow>

      {/* Slide-in Detail Panel */}
      {selectedNodeData && (
        <div className="glass-panel animate-slide-in-right" style={{
          position: 'absolute', right: 16, top: 16, bottom: 16, width: 320, zIndex: 100,
          display: 'flex', flexDirection: 'column', border: '1px solid var(--border-highlight)'
        }}>
          <div className="panel-header" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
              <Info size={14} /> Node Info
            </span>
            <button className="btn-icon" onClick={() => setSelectedNodeData(null)}><X size={14} /></button>
          </div>
          
          <div className="panel-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedNodeData.rawType}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                {selectedNodeData.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                {selectedNodeData.fullPath}
              </div>
            </div>

            {selectedNodeData.details?.is_dead && (
              <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, fontSize: 12, display: 'flex', gap: 6 }}>
                <Ghost size={14} /> <strong>Dead Code!</strong> No internal incoming calls.
              </div>
            )}

            {selectedNodeData.details?.issues?.length > 0 && (
              <div style={{ padding: 8, background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', gap: 6 }}><Bug size={14} /> Scanner Warnings:</div>
                <ul style={{ paddingLeft: 16 }}>
                  {selectedNodeData.details.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                </ul>
              </div>
            )}

            {selectedNodeData.details?.docstring && (
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, fontSize: 12, border: '1px solid var(--border-primary)' }}>
                <em>"{selectedNodeData.details.docstring}"</em>
              </div>
            )}

            {selectedNodeData.incomers?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Used by ({selectedNodeData.incomers.length}):</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selectedNodeData.incomers.slice(0, 10).map(inc => (
                    <span key={inc} style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: 11, border: '1px solid var(--border-primary)' }}>{inc}</span>
                  ))}
                  {selectedNodeData.incomers.length > 10 && <span style={{ fontSize: 11 }}>+ {selectedNodeData.incomers.length - 10} more</span>}
                </div>
              </div>
            )}

            <div style={{ flex: 1 }} />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => {
                if (selectedNodeData.rawType === 'Module') onFileSelect?.(selectedNodeData.fullPath);
                else onFunctionClick?.(selectedNodeData.parent || selectedNodeData.fullPath);
              }}>
                Open in Editor
              </button>
              <button className="btn btn-primary" onClick={handleAskAI}>
                <Cpu size={14} /> Ask AI about this
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
