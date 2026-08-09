/**
 * AuthContext.jsx - Authentication Provider for Lineageweaver
 * 
 * PURPOSE:
 * This context manages user authentication state across the entire app.
 * It handles Google sign-in/sign-out and provides user info to all components.
 * 
 * HOW IT WORKS:
 * 1. On app load, Firebase checks if user was previously signed in
 * 2. The onAuthStateChanged listener keeps auth state in sync
 * 3. Any component can access auth state via useAuth() hook
 * 4. Sign-in/sign-out functions are provided to components that need them
 * 
 * WHAT THIS PROVIDES:
 * - user: The current user object (or null if not signed in)
 * - loading: True while checking initial auth state
 * - signInWithGoogle: Function to trigger Google sign-in popup
 * - signOut: Function to sign out the user
 * 
 * FIREBASE AUTH FLOW:
 * ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
 * │ User clicks │ ──▶ │ Google popup │ ──▶ │ Firebase    │
 * │ "Sign In"   │     │ appears      │     │ creates     │
 * │             │     │              │     │ session     │
 * └─────────────┘     └──────────────┘     └─────────────┘
 *                                                 │
 *                                                 ▼
 *                     ┌──────────────────────────────────────┐
 *                     │ onAuthStateChanged fires             │
 *                     │ → AuthContext updates user state     │
 *                     │ → All components re-render with user │
 *                     └──────────────────────────────────────┘
 */

import { createContext, useContext, useState, useEffect , useMemo} from 'react';
import type { ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';

/**
 * The signed-in user as this app stores it.
 *
 * **A projection, not Firebase's `User`.** The auth listener copies four fields
 * out and drops the rest, so `getIdToken()`, `metadata`, `providerData` and the
 * other thirty members are not available from `useAuth()` — reaching for one
 * is a type error rather than a runtime `undefined`, which is the point of
 * naming the shape.
 *
 * Four is the right number: consumers read `uid` (44 sites), `displayName`,
 * `photoURL` and `email`, and nothing else.
 */
export interface AuthUser {
  /** The key every cloud-sync call is scoped by. */
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/** What `useAuth()` hands back. */
export interface AuthContextValue {
  user: AuthUser | null;
  /** True until the initial auth check settles. Gates the whole app. */
  loading: boolean;
  error: string | null;
  /**
   * Resolves to the user, or null when sign-in was cancelled or blocked.
   *
   * Note the asymmetry: this returns Firebase's **full** `User`, while `user`
   * above holds the four-field projection the listener stores. Nothing depends
   * on it — the one call site (`LoginPage`) awaits and discards the result, and
   * state arrives via `onAuthStateChanged` regardless. Recorded rather than
   * reconciled, because narrowing a return value nobody reads is a behaviour
   * change dressed as a tidy-up.
   */
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  isAuthenticated: () => boolean;
  clearError: () => void;
}

// Null until a provider mounts, which is what `useAuth` checks for.
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider Component
 * 
 * Wraps your app to provide authentication state to all children.
 * Must be placed high in the component tree (usually in App.jsx).
 * 
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // ==================== STATE ====================
  
  // The current user object from Firebase
  // Contains: uid, email, displayName, photoURL, etc.
  const [user, setUser] = useState<AuthUser | null>(null);
  
  // True while we're checking if user was previously signed in
  // Prevents flash of login screen on page refresh
  const [loading, setLoading] = useState(true);
  
  // Error state for auth operations
  const [error, setError] = useState<string | null>(null);

  // ==================== AUTH STATE LISTENER ====================
  
  useEffect(() => {
    // onAuthStateChanged returns an unsubscribe function
    // This listener fires:
    // 1. Immediately with current auth state (null or user)
    // 2. Whenever auth state changes (sign in, sign out, token refresh)
    
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        // Extract the info we need (Firebase user object has many fields)
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          // You can add more fields as needed
        });
        logger.log('🔐 User signed in:', firebaseUser.displayName);
      } else {
        // User is signed out
        setUser(null);
        logger.log('🔓 User signed out');
      }
      
      // Done checking initial state
      setLoading(false);
    }, (error) => {
      // Auth state listener error (rare)
      logger.error('🔥 Auth state error:', error);
      setError(errorMessage(error));
      setLoading(false);
    });

    // Check for redirect result (in case signInWithRedirect was used)
    getRedirectResult(auth).catch((error) => {
      if ((error as { code?: string }).code !== 'auth/no-current-user') {
        logger.error('🔥 Redirect result error:', error);
      }
    });

    // Cleanup: unsubscribe when component unmounts
    return () => unsubscribe();
  }, []);

  // ==================== SIGN IN FUNCTION ====================
  
  /**
   * Sign in with Google
   * Opens a popup window for Google authentication
   * 
   * @returns {Promise<Object>} The user object on success
   * @throws {Error} On authentication failure
   */
  const signInWithGoogle = async (): Promise<User | null> => {
    try {
      setError(null);
      
      // signInWithPopup opens Google's sign-in window
      // The user selects their account and grants permission
      // Firebase handles all the OAuth complexity
      const result = await signInWithPopup(auth, googleProvider);
      
      // The signed-in user info
      logger.log('✅ Sign in successful:', result.user.displayName);
      
      return result.user;
    } catch (error) {
      // Handle specific error cases
      logger.error('❌ Sign in failed:', error);
      
      // User closed the popup without signing in
      if ((error as { code?: string }).code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. Please try again.');
        return null;
      }
      
      // Popup was blocked by browser
      if ((error as { code?: string }).code === 'auth/popup-blocked') {
        setError('Popup was blocked. Please allow popups for this site.');
        // Fallback to redirect method
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          logger.error('Redirect also failed:', redirectError);
        }
        return null;
      }
      
      // Domain not authorized in Firebase Console
      if ((error as { code?: string }).code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized. Please add it in Firebase Console.');
        return null;
      }
      
      // Generic error
      setError(errorMessage(error));
      throw error;
    }
  };

  // ==================== SIGN OUT FUNCTION ====================
  
  /**
   * Sign out the current user
   * Clears the Firebase session and local state
   * 
   * @returns {Promise<void>}
   */
  const signOut = async (): Promise<void> => {
    try {
      setError(null);
      await firebaseSignOut(auth);
      logger.log('✅ Sign out successful');
    } catch (error) {
      logger.error('❌ Sign out failed:', error);
      setError(errorMessage(error));
      throw error;
    }
  };

  // ==================== HELPER FUNCTIONS ====================
  
  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  const isAuthenticated = (): boolean => {
    return user !== null;
  };

  /**
   * Clear any auth errors
   */
  const clearError = (): void => {
    setError(null);
  };

  // ==================== CONTEXT VALUE ====================
  
  // Memoized so consumers do not re-render on every provider render.
  const contextValue = useMemo(() => ({
    // User state
    user,
    loading,
    error,
    
    // Auth functions
    signInWithGoogle,
    signOut,
    
    // Helpers
    isAuthenticated,
    clearError
  }), [user, loading, error]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth Hook
 * 
 * Access auth context from any component.
 * Must be used within an AuthProvider.
 * 
 * @returns {Object} Auth context value
 * @throws {Error} If used outside AuthProvider
 * 
 * @example
 * function MyComponent() {
 *   const { user, signInWithGoogle, signOut } = useAuth();
 *   
 *   if (!user) {
 *     return <button onClick={signInWithGoogle}>Sign In</button>;
 *   }
 *   
 *   return (
 *     <div>
 *       Welcome, {user.displayName}!
 *       <button onClick={signOut}>Sign Out</button>
 *     </div>
 *   );
 * }
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  
  if (context === null) {
    throw new Error(
      'useAuth must be used within an AuthProvider. ' +
      'Make sure your component is wrapped in <AuthProvider>.'
    );
  }
  
  return context;
}

export default AuthContext;
