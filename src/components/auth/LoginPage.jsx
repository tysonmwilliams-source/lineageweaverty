/**
 * LoginPage.jsx - Authentication Landing Page
 *
 * PURPOSE:
 * A themed login page that matches Lineageweaver's medieval manuscript aesthetic.
 * Features Google sign-in button and handles authentication flow.
 *
 * Uses Framer Motion for animations, Lucide icons, and BEM CSS.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../ThemeContext';
import Icon from '../icons';
import './LoginPage.css';
import { logger } from '../../utils/logger';

// ==================== ANIMATION VARIANTS ====================
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 300
    }
  }
};

const ERROR_VARIANTS = {
  hidden: { opacity: 0, y: -10, height: 0 },
  visible: {
    opacity: 1,
    y: 0,
    height: 'auto',
    transition: { duration: 0.2 }
  },
  exit: {
    opacity: 0,
    y: -10,
    height: 0,
    transition: { duration: 0.15 }
  }
};

/**
 * Google icon SVG component - Official Google "G" logo colors
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
 * LoginPage Component
 */
export default function LoginPage() {
  const { signInWithGoogle, error, clearError } = useAuth();
  const { isDarkTheme } = useTheme();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      clearError();
      await signInWithGoogle();
    } catch (err) {
      logger.error('Sign-in error:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-page__card"
        variants={CARD_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <header className="login-page__header">
          <h1 className="login-page__title">Lineageweaver</h1>
          <p className="login-page__subtitle">Fantasy Genealogy for Worldbuilders</p>
        </header>

        {/* Divider */}
        <div className="login-page__divider">
          <Icon name="sparkles" size={20} className="login-page__divider-ornament" />
        </div>

        {/* Description */}
        <div className="login-page__description">
          <p>
            Track noble houses, magical bloodlines, and complex family trees
            for your fictional worlds.
          </p>
        </div>

        {/* Sign-in Section */}
        <div className="login-page__actions">
          <motion.button
            className="login-page__google-btn"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isSigningIn ? (
              <>
                <span className="login-page__spinner" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <GoogleIcon />
                <span>Sign in with Google</span>
              </>
            )}
          </motion.button>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="login-page__error"
                variants={ERROR_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Icon name="alert-triangle" size={16} className="login-page__error-icon" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="login-page__divider">
          <Icon name="sparkles" size={20} className="login-page__divider-ornament" />
        </div>

        {/* Footer */}
        <footer className="login-page__footer">
          <p>Your data is stored securely and synced across devices.</p>
        </footer>
      </motion.div>
    </div>
  );
}
