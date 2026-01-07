/**
 * Firebase Configuration for Lineageweaver
 * 
 * This file initializes Firebase and exports the services we need:
 * - auth: For Google sign-in and user management
 * - db: Firestore database for cloud storage
 * 
 * HOW THIS WORKS:
 * 1. We read configuration from environment variables (set in .env.local)
 * 2. Initialize the Firebase app with that config
 * 3. Create instances of the services we need
 * 4. Export them for use throughout the app
 * 
 * ENVIRONMENT VARIABLES:
 * All config values come from .env.local file (not committed to git).
 * Vite requires the VITE_ prefix to expose variables to the browser.
 * 
 * SECURITY NOTE:
 * These API keys are safe to include in client-side code. Firebase uses
 * security rules (not API keys) to protect your data. The keys just
 * identify your project - they don't grant access to anything.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ==================== CONFIGURATION ====================
// These values come from your Firebase Console → Project Settings → Your Apps

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// ==================== VALIDATION ====================
// Check that all required config values are present
// This catches setup mistakes early with helpful error messages

const requiredConfigs = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN', 
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingConfigs = requiredConfigs.filter(
  key => !import.meta.env[key]
);

if (missingConfigs.length > 0) {
  console.error(
    '🔥 Firebase Configuration Error!\n\n' +
    'Missing environment variables:\n' +
    missingConfigs.map(key => `  - ${key}`).join('\n') + '\n\n' +
    'To fix this:\n' +
    '1. Create a .env.local file in the project root\n' +
    '2. Add your Firebase config values (see docs/FIREBASE_SETUP_GUIDE.md)\n' +
    '3. Restart the dev server (npm run dev)\n'
  );
}

// ==================== INITIALIZATION ====================
// Initialize Firebase app (the main entry point)

let app;
let auth;
let db;
let googleProvider;

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig);
  
  // Initialize Authentication
  // This handles all user sign-in/sign-out operations
  auth = getAuth(app);
  
  // Initialize Firestore
  // This is our cloud database for storing genealogy data
  db = getFirestore(app);
  
  // Initialize Google Auth Provider
  // This configures how the Google sign-in popup works
  googleProvider = new GoogleAuthProvider();
  
  // Optional: Request additional Google account info
  // googleProvider.addScope('profile');
  // googleProvider.addScope('email');
  
  // Optional: Force account selection even if already signed in
  // This is useful during development/testing
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });
  
  console.log('🔥 Firebase initialized successfully');
  
} catch (error) {
  console.error('🔥 Firebase initialization failed:', error);
  
  // Provide helpful error context
  if (error.code === 'app/duplicate-app') {
    console.log('Firebase app already initialized - this is fine in development');
  }
}

// ==================== EXPORTS ====================
// Export the initialized services for use in other files

export { app, auth, db, googleProvider };

// Default export for convenience
export default app;
