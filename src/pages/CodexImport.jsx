/**
 * Codex Import Page
 *
 * Dedicated page for importing new worldbuilding content into The Codex.
 * All previous imports have been completed and archived.
 *
 * STYLED TO MATCH: Medieval manuscript aesthetic using theme CSS variables
 */

import { useNavigate } from 'react-router-dom';
import EnhancedCodexImportTool from '../components/EnhancedCodexImportTool';
import './CodexImport.css';
import Icon from '../components/icons';

export default function CodexImport() {
  const navigate = useNavigate();

  return (
    <div className="codex-import">
      {/* Header */}
      <header className="codex-import__header">
        <div className="codex-import__header-content">
          <div className="codex-import__header-text">
            <h1 className="codex-import__title">
              <Icon name="book-open" size={24} /> Codex Import
            </h1>
            <p className="codex-import__subtitle">
              Import worldbuilding content into The Codex
            </p>
          </div>
          <button
            onClick={() => navigate('/codex')}
            className="codex-import__back-button"
          >
            ← Back to Codex
          </button>
        </div>
      </header>

      {/* Import Tool */}
      <main className="codex-import__main">
        <EnhancedCodexImportTool />
      </main>
    </div>
  );
}
