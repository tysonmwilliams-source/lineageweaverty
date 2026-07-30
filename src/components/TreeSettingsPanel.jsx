/**
 * TreeSettingsPanel Component
 *
 * Collapsible settings panel for the Family Tree view.
 * Controls house selection, centering, relationship display, and branch view.
 * Uses HousePicker and PersonPicker comboboxes instead of raw <select> elements.
 */

import HousePicker from './HousePicker';
import PersonPicker from './PersonPicker';
import './TreeSettingsPanel.css';

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
    <div className="tree-settings">
      <div
        className={`tree-settings__panel ${
          isExpanded ? 'tree-settings__panel--expanded' : 'tree-settings__panel--collapsed'
        }`}
      >
        {/* House Selection */}
        <label className="tree-settings__label">
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
        <div className="tree-settings__section">
          <label className="tree-settings__label tree-settings__label--sm">
            Centre On:
          </label>
          <PersonPicker
            people={notablePeople}
            value={centreOnPersonId}
            onChange={onCentreOnChange}
          />
        </div>

        {/* Show Relationships Toggle */}
        <div className="tree-settings__section">
          <label className="tree-settings__toggle">
            <input
              type="checkbox"
              checked={showRelationships}
              onChange={(e) => onShowRelationshipsChange(e.target.checked)}
              className="tree-settings__toggle-input"
            />
            <span className="tree-settings__toggle-text">Show Relationships</span>
          </label>
        </div>

        {/* Branch View Toggle (only shown when multiple fragments exist) */}
        {hasMultipleFragments && (
          <div className="tree-settings__section">
            <label className="tree-settings__toggle">
              <input
                type="checkbox"
                checked={showBranchView}
                onChange={(e) => onShowBranchViewChange(e.target.checked)}
                className="tree-settings__toggle-input"
              />
              <span className="tree-settings__toggle-text">View Other Branches</span>
            </label>
            {showBranchView && (
              <p className="tree-settings__note">
                Split-screen branch view coming soon
              </p>
            )}
          </div>
        )}

        {/* Cadet Branch Navigation */}
        {(bastardCadets.length > 0 || nobleCadets.length > 0 || parentHouse) && (
          <div className="tree-settings__section">
            {/* Parent house link (when viewing a cadet branch) */}
            {parentHouse && (
              <div className="tree-settings__group">
                <span className="tree-settings__group-label">
                  Parent House:
                </span>
                <button
                  type="button"
                  onClick={() => onHouseChange(parentHouse.id)}
                  className="tree-settings__parent-btn"
                >
                  {parentHouse.houseName}
                </button>
              </div>
            )}

            {/* Noble cadets (already merged in tree — info only) */}
            {nobleCadets.length > 0 && (
              <div className="tree-settings__group">
                <span className="tree-settings__group-label">
                  Noble Branches (in tree):
                </span>
                <div className="tree-settings__chips">
                  {nobleCadets.map(h => (
                    <span key={h.id} className="tree-settings__chip">
                      {h.houseName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bastard cadets (separate trees — clickable navigation) */}
            {bastardCadets.length > 0 && (
              <div className="tree-settings__group">
                <span className="tree-settings__group-label">
                  Bastard Branches:
                </span>
                <div className="tree-settings__chips">
                  {bastardCadets.map(h => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => onHouseChange(h.id)}
                      className="tree-settings__chip-btn"
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
