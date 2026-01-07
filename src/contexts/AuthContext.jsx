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

import { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';

// Create the context
const AuthContext = createContext(null);

/**
 * AuthProvider Component
 * 
 * Wraps your app to provide authentication state to all children.
 * Must be placed high in the component tree (usually in App.jsx).
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 */
export function AuthProvider({ children }) {
  // ==================== STATE ====================
  
  // The current user object from Firebase
  // Contains: uid, email, displayName, photoURL, etc.
  const [user, setUser] = useState(null);
  
  // True while we're checking if user was previously signed in
  // Prevents flash of login screen on page refresh
  const [loading, setLoading] = useState(true);
  
  // Error state for auth operations
  const [error, setError] = useState(null);

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
        console.log('🔐 User signed in:', firebaseUser.displayName);
      } else {
        // User is signed out
        setUser(null);
        console.log('🔓 User signed out');
      }
      
      // Done checking initial state
      setLoading(false);
    }, (error) => {
      // Auth state listener error (rare)
      console.error('🔥 Auth state error:', error);
      setError(error.message);
      setLoading(false);
    });

    // Check for redirect result (in case signInWithRedirect was used)
    getRedirectResult(auth).catch((error) => {
      if (error.code !== 'auth/no-current-user') {
        console.error('🔥 Redirect result error:', error);
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
  const signInWithGoogle = async () => {
    try {
      setError(null);
      
      // signInWithPopup opens Google's sign-in window
      // The user selects their account and grants permission
      // Firebase handles all the OAuth complexity
      const result = await signInWithPopup(auth, googleProvider);
      
      // The signed-in user info
      console.log('✅ Sign in successful:', result.user.displayName);
      
      return result.user;
    } catch (error) {
      // Handle specific error cases
      console.error('❌ Sign in failed:', error);
      
      // User closed the popup without signing in
      if (error.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. Please try again.');
        return null;
      }
      
      // Popup was blocked by browser
      if (error.code === 'auth/popup-blocked') {
        setError('Popup was blocked. Please allow popups for this site.');
        // Fallback to redirect method
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          console.error('Redirect also failed:', redirectError);
        }
        return null;
      }
      
      // Domain not authorized in Firebase Console
      if (error.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized. Please add it in Firebase Console.');
        return null;
      }
      
      // Generic error
      setError(error.message);
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
  const signOut = async () => {
    try {
      setError(null);
      await firebaseSignOut(auth);
      console.log('✅ Sign out successful');
    } catch (error) {
      console.error('❌ Sign out failed:', error);
      setError(error.message);
      throw error;
    }
  };

  // ==================== HELPER FUNCTIONS ====================
  
  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  const isAuthenticated = () => {
    return user !== null;
  };

  /**
   * Clear any auth errors
   */
  const clearError = () => {
    setError(null);
  };

  // ==================== CONTEXT VALUE ====================
  
  const contextValue = {
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
  };

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
export function useAuth() {
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
