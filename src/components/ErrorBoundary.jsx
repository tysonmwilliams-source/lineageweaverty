/**
 * ErrorBoundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them, and displays a fallback UI instead of crashing the app.
 */
import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console (could also send to error reporting service)
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI from props, or default
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-boundary-icon">⚠️</div>
            <h2 className="error-boundary-title">Something went wrong</h2>
            <p className="error-boundary-message">
              {this.props.message || 'An unexpected error occurred. Please try again.'}
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details className="error-boundary-details">
                <summary>Error Details</summary>
                <pre>{this.state.error.toString()}</pre>
                {this.state.errorInfo && (
                  <pre>{this.state.errorInfo.componentStack}</pre>
                )}
              </details>
            )}

            <div className="error-boundary-actions">
              <button
                onClick={this.handleRetry}
                className="error-boundary-btn error-boundary-btn-primary"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="error-boundary-btn error-boundary-btn-secondary"
              >
                Go Home
              </button>
            </div>
          </div>

          <style>{`
            .error-boundary {
              min-height: 300px;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: var(--space-6);
              background: var(--bg-primary);
            }

            .error-boundary-content {
              text-align: center;
              max-width: 500px;
              padding: var(--space-6);
              background: var(--bg-secondary);
              border: 1px solid var(--border-primary);
              border-radius: var(--radius-lg);
            }

            .error-boundary-icon {
              font-size: 48px;
              margin-bottom: var(--space-4);
            }

            .error-boundary-title {
              font-family: var(--font-display);
              font-size: var(--text-2xl);
              color: var(--color-error);
              margin: 0 0 var(--space-2) 0;
            }

            .error-boundary-message {
              font-family: var(--font-body);
              font-size: var(--text-base);
              color: var(--text-secondary);
              margin: 0 0 var(--space-4) 0;
            }

            .error-boundary-details {
              text-align: left;
              margin-bottom: var(--space-4);
              padding: var(--space-3);
              background: var(--bg-tertiary);
              border-radius: var(--radius-md);
              font-size: var(--text-sm);
            }

            .error-boundary-details summary {
              cursor: pointer;
              font-weight: 600;
              margin-bottom: var(--space-2);
            }

            .error-boundary-details pre {
              margin: var(--space-2) 0 0 0;
              overflow-x: auto;
              white-space: pre-wrap;
              word-wrap: break-word;
              font-family: var(--font-mono);
              font-size: var(--text-xs);
              color: var(--color-error);
            }

            .error-boundary-actions {
              display: flex;
              gap: var(--space-3);
              justify-content: center;
            }

            .error-boundary-btn {
              padding: var(--space-2) var(--space-4);
              font-family: var(--font-body);
              font-size: var(--text-base);
              font-weight: 500;
              border: none;
              border-radius: var(--radius-md);
              cursor: pointer;
              transition: background-color var(--duration-fast) var(--ease-standard),
                          transform var(--duration-fast) var(--ease-standard);
            }

            .error-boundary-btn:hover {
              transform: translateY(-1px);
            }

            .error-boundary-btn-primary {
              background-color: var(--color-info);
              color: white;
            }

            .error-boundary-btn-primary:hover {
              background-color: var(--color-info-dark);
            }

            .error-boundary-btn-secondary {
              background-color: var(--bg-tertiary);
              color: var(--text-primary);
              border: 1px solid var(--border-primary);
            }

            .error-boundary-btn-secondary:hover {
              background-color: var(--bg-hover);
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
