/**
 * TreeSettingsPanel Component
 *
 * Collapsible settings panel for the Family Tree view.
 * Controls house selection, centering, relationship display, and branch view.
 * Uses HousePicker and PersonPicker comboboxes instead of raw <select> elements.
 */

import HousePicker from './HousePicker';
import PersonPicker from './PersonPicker';

function TreeSettingsPanel({
  // Panel state
  isExpanded,

  // House selection
  houses,
  people,
  selectedHouseId,
  onHouseChange,

  // Centre on person
  centreOnPersonId,
  onCentreOnChange,
  notablePeople,

  // Relationship display
  showRelationships,
  onShowRelationshipsChange,

  // Branch view (for fragments)
  showBranchView,
  onShowBranchViewChange,
  hasMultipleFragments,

  // Cadet branch navigation
  bastardCadets = [],
  nobleCadets = [],
  parentHouse = null
}) {
  return (
    <div className="fixed top-20 right-6 z-10">
      <div
        className="rounded-lg shadow-lg transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderWidth: '1px',
          borderColor: 'var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          width: '18rem',
          maxHeight: isExpanded ? '600px' : '0',
          opacity: isExpanded ? '1' : '0',
          padding: isExpanded ? '1rem' : '0 1rem',
          overflow: isExpanded ? 'visible' : 'hidden'
        }}
      >
        {/* House Selection */}
        <label className="block mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
          View House:
        </label>
        <HousePicker
          houses={houses}
          people={people}
          selectedHouseId={selectedHouseId}
          onHouseChange={onHouseChange}
          compact
        />

        {/* Centre On Person */}
        <div className="mt-4 pt-4" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
          <label className="block mb-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Centre On:
          </label>
          <PersonPicker
            people={notablePeople}
            value={centreOnPersonId}
            onChange={onCentreOnChange}
          />
        </div>

        {/* Show Relationships Toggle */}
        <div className="mt-4 pt-4" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
          <label className="flex items-center cursor-pointer transition-opacity hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={showRelationships}
              onChange={(e) => onShowRelationshipsChange(e.target.checked)}
              className="mr-2 w-4 h-4"
            />
            <span className="text-sm">Show Relationships</span>
          </label>
        </div>

        {/* Branch View Toggle (only shown when multiple fragments exist) */}
        {hasMultipleFragments && (
          <div className="mt-4 pt-4" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
            <label className="flex items-center cursor-pointer transition-opacity hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={showBranchView}
                onChange={(e) => onShowBranchViewChange(e.target.checked)}
                className="mr-2 w-4 h-4"
              />
              <span className="text-sm">View Other Branches</span>
            </label>
            {showBranchView && (
              <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Split-screen branch view coming soon
              </p>
            )}
          </div>
        )}

        {/* Cadet Branch Navigation */}
        {(bastardCadets.length > 0 || nobleCadets.length > 0 || parentHouse) && (
          <div className="mt-4 pt-4" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
            {/* Parent house link (when viewing a cadet branch) */}
            {parentHouse && (
              <div className="mb-3">
                <span className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  Parent House:
                </span>
                <button
                  onClick={() => onHouseChange(parentHouse.id)}
                  className="text-sm px-3 py-1.5 rounded-md transition-colors w-full text-left"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border-primary)'
                  }}
                  onMouseEnter={e => e.target.style.backgroundColor = 'var(--bg-hover)'}
                  onMouseLeave={e => e.target.style.backgroundColor = 'var(--bg-tertiary)'}
                >
                  {parentHouse.houseName}
                </button>
              </div>
            )}

            {/* Noble cadets (already merged in tree — info only) */}
            {nobleCadets.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  Noble Branches (in tree):
                </span>
                <div className="flex flex-wrap gap-1">
                  {nobleCadets.map(h => (
                    <span
                      key={h.id}
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {h.houseName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bastard cadets (separate trees — clickable navigation) */}
            {bastardCadets.length > 0 && (
              <div>
                <span className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  Bastard Branches:
                </span>
                <div className="flex flex-wrap gap-1">
                  {bastardCadets.map(h => (
                    <button
                      key={h.id}
                      onClick={() => onHouseChange(h.id)}
                      className="text-xs px-2 py-1 rounded transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        borderWidth: '1px',
                        borderColor: 'var(--border-primary)'
                      }}
                      onMouseEnter={e => e.target.style.backgroundColor = 'var(--bg-hover)'}
                      onMouseLeave={e => e.target.style.backgroundColor = 'var(--bg-tertiary)'}
                    >
                      {h.houseName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TreeSettingsPanel;
