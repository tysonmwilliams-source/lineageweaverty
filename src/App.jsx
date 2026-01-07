import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Home from './pages/Home';
import FamilyTree from './pages/FamilyTree';
import ManageData from './pages/ManageData';
import CodexLanding from './pages/CodexLanding';
import CodexEntryForm from './pages/CodexEntryForm';
import CodexEntryView from './pages/CodexEntryView';
import CodexBrowse from './pages/CodexBrowse';
import CodexImport from './pages/CodexImport';
import { initializeSampleData } from './services/sampleData';
import { ThemeProvider } from './components/ThemeContext';
import { GenealogyProvider } from './contexts/GenealogyContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth';

/**
 * Main App Component
 * 
 * This is the root component that:
 * 1. Sets up authentication (AuthProvider)
 * 2. Sets up routing (navigation between pages)
 * 3. Initializes the database with sample data on first load
 * 4. Provides the overall app structure
 * 
 * PROVIDER HIERARCHY:
 * AuthProvider (authentication) ← MUST be outermost so useAuth works everywhere
 *   └─ ThemeProvider (theming)
 *        └─ ProtectedRoute (auth gate)
 *             └─ GenealogyProvider (shared data + cloud sync)
 *                  └─ Router (navigation)
 *                       └─ Pages
 * 
 * WHY THIS ORDER?
 * - AuthProvider must be outermost so GenealogyProvider can use useAuth()
 * - ThemeProvider wraps ProtectedRoute so login page is themed
 * - GenealogyProvider is INSIDE ProtectedRoute because:
 *   - It needs access to user.uid for cloud sync
 *   - No point initializing sync if user isn't logged in
 * - Router wraps Pages for navigation
 */

/**
 * AppContent Component
 * 
 * The main app content, shown after authentication.
 * GenealogyProvider is here so it has access to the authenticated user.
 */
function AppContent() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [initError, setInitError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    async function setupDatabase() {
      try {
        console.log('Initializing database...');
        await initializeSampleData();
        setDbInitialized(true);
        console.log('Database ready!');
      } catch (error) {
        console.error('Failed to initialize database:', error);
        setInitError(error.message);
      }
    }

    setupDatabase();
  }, []);

  // Database initializing
  if (!dbInitialized && !initError) {
    return (
      <div className="init-screen">
        <div className="init-content">
          <div className="init-icon">⏳</div>
          <h2 className="init-title">Initializing Lineageweaver...</h2>
          <p className="init-text">Setting up your local database</p>
          {user && (
            <p className="init-user">Signed in as {user.displayName}</p>
          )}
        </div>

        <style>{`
          .init-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-primary);
          }
          .init-content {
            text-align: center;
          }
          .init-icon {
            font-size: 48px;
            margin-bottom: var(--space-4);
          }
          .init-title {
            font-family: var(--font-display);
            font-size: var(--text-2xl);
            color: var(--text-primary);
            margin: 0 0 var(--space-2) 0;
          }
          .init-text {
            font-family: var(--font-body);
            font-size: var(--text-base);
            color: var(--text-secondary);
            margin: 0;
          }
          .init-user {
            font-family: var(--font-body);
            font-size: var(--text-sm);
            color: var(--text-tertiary);
            margin-top: var(--space-4);
          }
        `}</style>
      </div>
    );
  }

  // Database initialization error
  if (initError) {
    return (
      <div className="error-screen">
        <div className="error-content">
          <div className="error-icon">⚠️</div>
          <h2 className="error-title">Initialization Error</h2>
          <p className="error-text">Failed to initialize the database: {initError}</p>
          <button 
            onClick={() => window.location.reload()}
            className="retry-button"
          >
            Retry
          </button>
        </div>

        <style>{`
          .error-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-primary);
          }
          .error-content {
            text-align: center;
            max-width: 400px;
            padding: var(--space-6);
          }
          .error-icon {
            font-size: 48px;
            margin-bottom: var(--space-4);
          }
          .error-title {
            font-family: var(--font-display);
            font-size: var(--text-2xl);
            color: var(--color-error);
            margin: 0 0 var(--space-2) 0;
          }
          .error-text {
            font-family: var(--font-body);
            font-size: var(--text-base);
            color: var(--text-secondary);
            margin: 0 0 var(--space-4) 0;
          }
          .retry-button {
            padding: var(--space-2) var(--space-6);
            background: var(--color-info);
            color: white;
            border: none;
            border-radius: var(--radius-md);
            font-family: var(--font-body);
            font-size: var(--text-base);
            cursor: pointer;
            transition: background-color var(--duration-fast) var(--ease-standard);
          }
          .retry-button:hover {
            background: var(--color-info-dark);
          }
        `}</style>
      </div>
    );
  }

  // Database ready - render the app with GenealogyProvider
  // GenealogyProvider is here (inside ProtectedRoute) so it has access to user
  return (
    <GenealogyProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tree" element={<FamilyTree />} />
          <Route path="/manage" element={<ManageData />} />
          <Route path="/codex" element={<CodexLanding />} />
          <Route path="/codex/create" element={<CodexEntryForm />} />
          <Route path="/codex/edit/:id" element={<CodexEntryForm />} />
          <Route path="/codex/entry/:id" element={<CodexEntryView />} />
          <Route path="/codex/browse/:type" element={<CodexBrowse />} />
          <Route path="/codex/import" element={<CodexImport />} />
        </Routes>
      </Router>
    </GenealogyProvider>
  );
}

/**
 * Main App Component
 * 
 * Sets up the provider hierarchy and authentication wrapper.
 */
function App() {
  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="royal-parchment">
        <ProtectedRoute>
          <AppContent />
        </ProtectedRoute>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
