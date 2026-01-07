/**
 * LoginPage.jsx - Authentication Landing Page
 * 
 * A themed login page that matches Lineageweaver's medieval manuscript aesthetic.
 * Features Google sign-in button and handles authentication flow.
 * 
 * DESIGN NOTES:
 * - Uses Royal Parchment theme colors and typography
 * - Centered layout with decorative elements
 * - Shows loading state during sign-in
 * - Displays errors with themed styling
 */

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../ThemeContext';

/**
 * Google icon SVG component
 * Official Google "G" logo colors
 */
const GoogleIcon = () => (
  <svg 
    width="18" 
    height="18" 
    viewBox="0 0 18 18" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" 
      fill="#4285F4"
    />
    <path 
      d="M9.003 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.26c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" 
      fill="#34A853"
    />
    <path 
      d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" 
      fill="#FBBC05"
    />
    <path 
      d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" 
      fill="#EA4335"
    />
  </svg>
);

/**
 * Decorative divider component
 */
const Divider = () => (
  <div className="divider">
    <span className="divider-ornament">❧</span>
  </div>
);

/**
 * LoginPage Component
 */
export default function LoginPage() {
  const { signInWithGoogle, error, clearError } = useAuth();
  const { isDarkTheme } = useTheme();
  
  // Local loading state for sign-in button
  const [isSigningIn, setIsSigningIn] = useState(false);

  /**
   * Handle Google sign-in click
   */
  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      clearError();
      await signInWithGoogle();
      // If successful, AuthContext will update and App.jsx will redirect
    } catch (err) {
      // Error is handled by AuthContext
      console.error('Sign-in error:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Header */}
        <header className="login-header">
          <h1 className="login-title">Lineageweaver</h1>
          <p className="login-subtitle">Fantasy Genealogy for Worldbuilders</p>
        </header>

        <Divider />

        {/* Description */}
        <div className="login-description">
          <p>
            Track noble houses, magical bloodlines, and complex family trees 
            for your fictional worlds.
          </p>
        </div>

        {/* Sign-in Section */}
        <div className="login-actions">
          <button 
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="google-signin-button"
          >
            {isSigningIn ? (
              <>
                <span className="spinner" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <GoogleIcon />
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          {/* Error Message */}
          {error && (
            <div className="login-error">
              <span className="error-icon">⚠</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <Divider />

        {/* Footer */}
        <footer className="login-footer">
          <p>Your data is stored securely and synced across devices.</p>
        </footer>
      </div>

      {/* Inline Styles - Themed for Royal Parchment */}
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-6);
          background: var(--bg-primary);
          background-image: 
            radial-gradient(ellipse at top, var(--bg-secondary) 0%, transparent 50%),
            radial-gradient(ellipse at bottom, var(--parchment-dark) 0%, transparent 50%);
        }

        .login-container {
          width: 100%;
          max-width: 420px;
          padding: var(--space-8);
          background: var(--bg-tertiary);
          border: 2px solid var(--border-secondary);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-xl);
          text-align: center;
        }

        /* Header */
        .login-header {
          margin-bottom: var(--space-4);
        }

        .login-title {
          font-family: var(--font-display);
          font-size: var(--text-4xl);
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 var(--space-2) 0;
          letter-spacing: var(--tracking-wide);
        }

        .login-subtitle {
          font-family: var(--font-body);
          font-size: var(--text-lg);
          color: var(--text-secondary);
          margin: 0;
          font-style: italic;
        }

        /* Divider */
        .divider {
          display: flex;
          align-items: center;
          justify-content: center;
          margin: var(--space-6) 0;
        }

        .divider-ornament {
          color: var(--border-heavy);
          font-size: var(--text-xl);
        }

        /* Description */
        .login-description {
          margin-bottom: var(--space-6);
        }

        .login-description p {
          font-family: var(--font-body);
          font-size: var(--text-base);
          color: var(--text-secondary);
          line-height: var(--leading-relaxed);
          margin: 0;
        }

        /* Actions */
        .login-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-4);
        }

        /* Google Sign-in Button */
        .google-signin-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
          width: 100%;
          max-width: 280px;
          padding: var(--space-3) var(--space-6);
          background: #ffffff;
          border: 1px solid #dadce0;
          border-radius: var(--radius-md);
          font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #3c4043;
          cursor: pointer;
          transition: 
            background-color var(--duration-fast) var(--ease-standard),
            box-shadow var(--duration-fast) var(--ease-standard);
        }

        .google-signin-button:hover:not(:disabled) {
          background: #f8f9fa;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }

        .google-signin-button:active:not(:disabled) {
          background: #f1f3f4;
        }

        .google-signin-button:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }

        .google-signin-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        /* Spinner */
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid #dadce0;
          border-top-color: #4285f4;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Error Message */
        .login-error {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-4);
          background: var(--color-error-bg);
          border: 1px solid var(--color-error);
          border-radius: var(--radius-md);
          color: var(--color-error-light);
          font-size: var(--text-sm);
        }

        .error-icon {
          flex-shrink: 0;
        }

        /* Footer */
        .login-footer {
          margin-top: var(--space-2);
        }

        .login-footer p {
          font-family: var(--font-body);
          font-size: var(--text-sm);
          color: var(--text-tertiary);
          margin: 0;
        }

        /* Responsive adjustments */
        @media (max-width: 480px) {
          .login-container {
            padding: var(--space-6);
          }

          .login-title {
            font-size: var(--text-3xl);
          }
        }
      `}</style>
    </div>
  );
}
