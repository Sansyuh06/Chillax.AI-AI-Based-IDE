import React, { useEffect, useRef, useCallback } from 'react';

/**
 * Integrated terminal using xterm.js connected to backend WebSocket.
 */
export default function Terminal({ visible, projectRoot }) {
    const termRef = useRef(null);
    const xtermRef = useRef(null);
    const wsRef = useRef(null);
    const fitRef = useRef(null);
    const initialized = useRef(false);

    const initTerminal = useCallback(async () => {
        if (initialized.current || !termRef.current || !visible) return;
        initialized.current = true;

        try {
            const { Terminal: XTerminal } = await import('@xterm/xterm');
            const { FitAddon } = await import('@xterm/addon-fit');

            // Import CSS
            await import('@xterm/xterm/css/xterm.css');

            const term = new XTerminal({
                cursorBlink: true,
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                theme: {
                    background: '#0d1117',
                    foreground: '#e6edf3',
                    cursor: '#58a6ff',
                    selectionBackground: '#264f78',
                    black: '#0d1117',
                    red: '#f85149',
                    green: '#3fb950',
                    yellow: '#d29922',
                    blue: '#58a6ff',
                    magenta: '#bc8cff',
                    cyan: '#39d2c0',
                    white: '#e6edf3',
                    brightBlack: '#6e7681',
                    brightRed: '#f85149',
                    brightGreen: '#3fb950',
                    brightYellow: '#d29922',
                    brightBlue: '#58a6ff',
                    brightMagenta: '#bc8cff',
                    brightCyan: '#39d2c0',
                    brightWhite: '#ffffff',
                },
                scrollback: 5000,
            });

            const fit = new FitAddon();
            term.loadAddon(fit);
            term.open(termRef.current);
            fit.fit();

            xtermRef.current = term;
            fitRef.current = fit;

            // Connect WebSocket
            const wsUrl = `ws://localhost:8000/ws/terminal`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                term.writeln('\x1b[36m● Chillax.AI Terminal\x1b[0m');
                term.writeln('\x1b[90m  Connected to local shell\x1b[0m');
                term.writeln('');
            };

            ws.onmessage = (event) => {
                term.write(event.data);
            };

            ws.onerror = () => {
                term.writeln('\x1b[31m✗ Failed to connect to terminal backend\x1b[0m');
            };

            ws.onclose = () => {
                term.writeln('\x1b[90m\r\n● Terminal disconnected\x1b[0m');
            };

            // Send user input to backend
            term.onData((data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                }
            });

            // Handle resize
            const ro = new ResizeObserver(() => {
                try { fit.fit(); } catch { }
            });
            ro.observe(termRef.current);

        } catch (err) {
            console.error('Terminal init error:', err);
            if (termRef.current) {
                termRef.current.innerHTML = `<div style="padding:12px;color:var(--text-muted);font-size:13px;">Terminal: ${err.message}</div>`;
            }
        }
    }, [visible]);

    useEffect(() => {
        if (visible && !initialized.current) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(initTerminal, 100);
            return () => clearTimeout(timer);
        }
    }, [visible, initTerminal]);

    useEffect(() => {
        if (visible && fitRef.current) {
            try { fitRef.current.fit(); } catch { }
        }
    }, [visible]);

    // Send a command to the terminal (used for Run)
    useEffect(() => {
        if (typeof Terminal.sendCommand === 'function') return;
        Terminal.sendCommand = (cmd) => {
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(cmd + '\r');
            }
        };
    }, []);

    if (!visible) return null;

    return (
        <div
            ref={termRef}
            style={{
                height: '100%',
                width: '100%',
                overflow: 'hidden',
            }}
        />
    );
}

// Static method to send commands from outside
Terminal.sendCommand = () => { };
