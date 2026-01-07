/**
 * SyncStatusIndicator.jsx - Cloud Sync Status Display
 * 
 * Shows the current sync status as a small indicator in the navigation bar.
 * Helps users understand if their data is being saved to the cloud.
 */

import { useGenealogy } from '../../contexts/GenealogyContext';

export default function SyncStatusIndicator() {
  const { syncStatus } = useGenealogy();

  // Don't show anything if idle (initial state before first sync)
  if (syncStatus === 'idle') {
    return null;
  }

  const statusConfig = {
    syncing: {
      icon: '☁️',
      text: 'Syncing...',
      className: 'sync-syncing'
    },
    synced: {
      icon: '✓',
      text: 'Synced',
      className: 'sync-synced'
    },
    error: {
      icon: '⚠',
      text: 'Sync error',
      className: 'sync-error'
    }
  };

  const config = statusConfig[syncStatus] || statusConfig.synced;

  return (
    <div className={`sync-indicator ${config.className}`} title={config.text}>
      <span className="sync-icon">{config.icon}</span>
      <span className="sync-text">{config.text}</span>

      <style>{`
        .sync-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-family: var(--font-body);
          font-size: var(--text-xs);
          transition: all var(--duration-fast) var(--ease-standard);
        }

        .sync-syncing {
          color: var(--color-info-light);
          background: var(--color-info-bg);
        }

        .sync-syncing .sync-icon {
          animation: pulse 1.5s ease-in-out infinite;
        }

        .sync-synced {
          color: var(--color-success-light);
          background: var(--color-success-bg);
        }

        .sync-error {
          color: var(--color-error-light);
          background: var(--color-error-bg);
        }

        .sync-icon {
          font-size: var(--text-sm);
        }

        .sync-text {
          display: none;
        }

        /* Show text on hover */
        .sync-indicator:hover .sync-text {
          display: inline;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* On larger screens, always show text */
        @media (min-width: 768px) {
          .sync-text {
            display: inline;
          }
        }
      `}</style>
    </div>
  );
}
