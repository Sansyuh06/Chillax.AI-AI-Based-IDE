import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: 40, background: '#0d1117', color: '#e6edf3',
                    height: '100vh', fontFamily: 'sans-serif'
                }}>
                    <h2 style={{ color: '#f85149' }}>Something went wrong</h2>
                    <pre style={{
                        background: '#161b22', padding: 20, borderRadius: 6,
                        overflow: 'auto', border: '1px solid #30363d'
                    }}>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: 20, padding: '8px 16px', background: '#238636',
                            color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer'
                        }}
                    >
                        Reload App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
