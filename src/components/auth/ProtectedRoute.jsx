/**
 * ProtectedRoute.jsx - Route Guard Component
 * 
 * PURPOSE:
 * Wraps routes that require authentication. If the user isn't signed in,
 * they're redirected to the login page. If they are signed in, the
 * protected content is rendered.
 * 
 * HOW IT WORKS:
 * 1. Check if auth is still loading (show loading spinner)
 * 2. Check if user is authenticated
 * 3. If not authenticated → show login page
 * 4. If authenticated → render children (the protected content)
 * 
 * USAGE:
 * In your routes, wrap protected pages like this:
 * 
 *   <Route path="/tree" element={
 *     <ProtectedRoute>
 *       <FamilyTree />
 *     </ProtectedRoute>
 *   } />
 * 
 * Or wrap multiple routes at once in App.jsx.
 */

import { useAuth } from '../../contexts/AuthContext';
import LoginPage from './LoginPage';

/**
 * Loading spinner component
 * Shown while checking authentication status
 */
function LoadingSpinner() {
  return (
    <div className="auth-loading">
      <div className="auth-loading-content">
        <div className="auth-loading-spinner" />
        <p>Checking authentication...</p>
      </div>

      <style>{`
        .auth-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary);
        }

        .auth-loading-content {
          text-align: center;
        }

        .auth-loading-spinner {
          width: 48px;
          height: 48px;
          margin: 0 auto var(--space-4);
          border: 3px solid var(--border-secondary);
          border-top-color: var(--focus-ring);
          border-radius: 50%;
          animation: auth-spin 1s linear infinite;
        }

        .auth-loading-content p {
          font-family: var(--font-body);
          font-size: var(--text-base);
          color: var(--text-secondary);
          margin: 0;
        }

        @keyframes auth-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * ProtectedRoute Component
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Protected content to render
 * @param {React.ReactNode} props.fallback - Optional custom login component
 */
export default function ProtectedRoute({ children, fallback = null }) {
  const { user, loading } = useAuth();

  // Still checking auth status - show loading spinner
  if (loading) {
    return <LoadingSpinner />;
  }

  // Not authenticated - show login page (or custom fallback)
  if (!user) {
    return fallback || <LoginPage />;
  }

  // Authenticated - render the protected content
  return children;
}
