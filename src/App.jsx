import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import Home from './pages/Home';
import { initializeSampleData } from './services/sampleData';

// Lazy-loaded page components for code-splitting
// This reduces initial bundle size by loading pages on-demand
const FamilyTree = lazy(() => import('./pages/FamilyTree'));
const ManageData = lazy(() => import('./pages/ManageData'));
const CodexLanding = lazy(() => import('./pages/CodexLanding'));
const CodexEntryForm = lazy(() => import('./pages/CodexEntryForm'));
const CodexEntryView = lazy(() => import('./pages/CodexEntryView'));
const CodexBrowse = lazy(() => import('./pages/CodexBrowse'));
const CodexImport = lazy(() => import('./pages/CodexImport'));
const HeraldryLanding = lazy(() => import('./pages/HeraldryLanding'));
const HeraldryCreator = lazy(() => import('./pages/HeraldryCreator'));
const ChargesLibrary = lazy(() => import('./pages/ChargesLibrary'));
const DignitiesLanding = lazy(() => import('./pages/DignitiesLanding'));
const DignityForm = lazy(() => import('./pages/DignityForm'));
const DignityView = lazy(() => import('./pages/DignityView'));
const DignityAnalysis = lazy(() => import('./pages/DignityAnalysis'));
const BugTracker = lazy(() => import('./pages/BugTracker'));

// Loading fallback for lazy-loaded routes
function PageLoader() {
  return (
    <div className="page-loader">
      <div className="loader-content">
        <div className="loader-spinner"></div>
        <p>Loading...</p>
      </div>
      <style>{`
        .page-loader {
          min-height: 50vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary);
        }
        .loader-content {
          text-align: center;
          color: var(--text-secondary);
        }
        .loader-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-primary);
          border-top-color: var(--color-info);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto var(--space-3);
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
import { ThemeProvider } from './components/ThemeContext';
import { GenealogyProvider } from './contexts/GenealogyContext';
import { BugTrackerProvider } from './contexts/BugContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth';
import BugReporterButton from './components/bugs/BugReporterButton';
import ErrorBoundary from './components/ErrorBoundary';

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
  // BugTrackerProvider wraps everything so the floating bug reporter works on all pages
  return (
    <GenealogyProvider>
      <BugTrackerProvider>
        <Router>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
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
              <Route path="/heraldry" element={<HeraldryLanding />} />
              <Route path="/heraldry/create" element={<HeraldryCreator />} />
              <Route path="/heraldry/edit/:id" element={<HeraldryCreator />} />
              <Route path="/heraldry/charges" element={<ChargesLibrary />} />
              <Route path="/dignities" element={<DignitiesLanding />} />
              <Route path="/dignities/create" element={<DignityForm />} />
              <Route path="/dignities/edit/:id" element={<DignityForm />} />
              <Route path="/dignities/view/:id" element={<DignityView />} />
              <Route path="/dignities/analysis" element={<DignityAnalysis />} />
              <Route path="/bugs" element={<BugTracker />} />
              </Routes>
            </Suspense>
            {/* Floating bug reporter button - visible on all pages */}
            <BugReporterButton />
          </ErrorBoundary>
        </Router>
      </BugTrackerProvider>
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
