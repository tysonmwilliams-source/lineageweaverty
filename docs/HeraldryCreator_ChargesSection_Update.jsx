/**
 * Updated Charges Section JSX for HeraldryCreator
 * 
 * This is the complete replacement for the Charges section in HeraldryCreator.jsx
 * It adds support for both basic charges AND external charges (from the 82 SVGs).
 * 
 * TO INTEGRATE:
 * 1. Find the {/* Charges *\/} section in HeraldryCreator.jsx (around line 950)
 * 2. Replace the entire <section className="design-section"> for charges with this code
 * 
 * REQUIRED IMPORTS (add at top of file):
 * 
 * import {
 *   EXTERNAL_CHARGES,
 *   EXTERNAL_CHARGE_CATEGORIES,
 *   getExternalChargesByCategory
 * } from '../data/externalChargesLibrary';
 * import { ExternalChargePreview } from '../components/heraldry/ExternalChargeRenderer';
 * 
 * REQUIRED STATE VARIABLES (add in component):
 * 
 * const [useExternalCharge, setUseExternalCharge] = useState(false);
 * const [externalChargeId, setExternalChargeId] = useState('rose8');
 * const [activeExternalCategory, setActiveExternalCategory] = useState('flora');
 */

// ═══════════════════════════════════════════════════════════════════════════════
// REPLACEMENT CHARGES SECTION JSX
// Copy everything below into HeraldryCreator.jsx
// ═══════════════════════════════════════════════════════════════════════════════

const ChargesSectionJSX = `
            {/* Charges */}
            <section className="design-section">
              <h2 
                className={\`section-title collapsible \${activeSection === 'charges' ? 'active' : ''}\`}
                onClick={() => setActiveSection(activeSection === 'charges' ? '' : 'charges')}
              >
                <span>Charges (Symbols)</span>
                <span className="collapse-icon">{activeSection === 'charges' ? '▼' : '▶'}</span>
              </h2>
              
              {activeSection === 'charges' && (
                <div className="charges-section">
                  {/* Enable/Disable Toggle */}
                  <div className="option-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={chargeEnabled}
                        onChange={(e) => setChargeEnabled(e.target.checked)}
                        className="invert-checkbox"
                      />
                      <span className="checkbox-label">Add a Charge to Shield</span>
                    </label>
                  </div>
                  
                  {chargeEnabled && (
                    <div className="division-options">
                      <h3 className="options-title">Charge Options</h3>
                      
                      {/* Charge Library Toggle - Basic vs External */}
                      <div className="option-group">
                        <label>Charge Library</label>
                        <div className="charge-library-toggle">
                          <button
                            type="button"
                            className={\`library-toggle-btn \${!useExternalCharge ? 'selected' : ''}\`}
                            onClick={() => setUseExternalCharge(false)}
                          >
                            🎨 Basic Charges
                          </button>
                          <button
                            type="button"
                            className={\`library-toggle-btn \${useExternalCharge ? 'selected' : ''}\`}
                            onClick={() => setUseExternalCharge(true)}
                          >
                            📜 Detailed Library (82)
                          </button>
                        </div>
                        <p className="help-text" style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                          {useExternalCharge 
                            ? 'High-detail heraldic art from Traceable Heraldic Art (public domain)'
                            : 'Simple vector charges designed for clean rendering'}
                        </p>
                      </div>
                      
                      {/* Basic Charge Selection */}
                      {!useExternalCharge && (
                        <div className="option-group">
                          <label>Select Charge</label>
                          <div className="charge-category-tabs">
                            {Object.entries(CHARGE_CATEGORIES).map(([catId, cat]) => (
                              <button
                                key={catId}
                                type="button"
                                className={\`line-style-option \${activeChargeCategory === catId ? 'selected' : ''}\`}
                                onClick={() => setActiveChargeCategory(catId)}
                              >
                                <span>{cat.icon}</span> {cat.name}
                              </button>
                            ))}
                          </div>
                          <div className="charge-grid">
                            {Object.entries(CHARGES)
                              .filter(([_, charge]) => charge.category === activeChargeCategory)
                              .map(([id, charge]) => (
                                <button
                                  key={id}
                                  type="button"
                                  className={\`division-option \${chargeId === id ? 'selected' : ''}\`}
                                  onClick={() => setChargeId(id)}
                                  title={charge.description}
                                >
                                  <span className="division-name">{charge.name}</span>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                      
                      {/* External Charge Selection */}
                      {useExternalCharge && (
                        <div className="option-group">
                          <label>Select Detailed Charge</label>
                          <div className="charge-category-tabs">
                            {Object.entries(EXTERNAL_CHARGE_CATEGORIES).map(([catId, cat]) => (
                              <button
                                key={catId}
                                type="button"
                                className={\`line-style-option \${activeExternalCategory === catId ? 'selected' : ''}\`}
                                onClick={() => setActiveExternalCategory(catId)}
                              >
                                <span>{cat.icon}</span> {cat.name}
                              </button>
                            ))}
                          </div>
                          <div className="external-charge-grid">
                            {Object.entries(getExternalChargesByCategory(activeExternalCategory))
                              .map(([id, charge]) => (
                                <ExternalChargePreview
                                  key={id}
                                  chargeId={id}
                                  tincture={TINCTURES[chargeTincture]?.hex || '#000000'}
                                  size={50}
                                  selected={externalChargeId === id}
                                  onClick={() => setExternalChargeId(id)}
                                  showName={true}
                                />
                              ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Charge Tincture */}
                      <div className="option-group">
                        <label>Charge Tincture</label>
                        <div className="tincture-grid">
                          {Object.entries(TINCTURES).map(([key, tinc]) => (
                            <button
                              key={key}
                              type="button"
                              className={\`tincture-option \${chargeTincture === key ? 'selected' : ''}\`}
                              onClick={() => setChargeTincture(key)}
                              title={tinc.name}
                              style={{ 
                                backgroundColor: tinc.hex,
                                color: ['or', 'argent'].includes(key) ? '#000' : '#fff'
                              }}
                            >
                              {key.charAt(0).toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Charge Count */}
                      <div className="option-group">
                        <label>Number of Charges</label>
                        <div className="count-controls">
                          {[1, 2, 3].map(num => (
                            <button
                              key={num}
                              type="button"
                              className={\`count-button \${chargeCount === num ? 'selected' : ''}\`}
                              onClick={() => {
                                setChargeCount(num);
                                if (num === 1) setChargeArrangement('fessPoint');
                                else if (num === 2) setChargeArrangement('pale');
                                else setChargeArrangement('twoAndOne');
                              }}
                            >
                              {num}
                            </button>
                          ))}
                          <span className="count-value">
                            {chargeCount === 1 ? 'Single' : chargeCount === 2 ? 'Double' : 'Triple'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Arrangement (for 2 or 3 charges) */}
                      {chargeCount > 1 && (
                        <div className="option-group">
                          <label>Arrangement</label>
                          <div className="thickness-controls">
                            {Object.keys(CHARGE_ARRANGEMENTS[chargeCount] || {}).map(arr => (
                              <button
                                key={arr}
                                type="button"
                                className={\`thickness-button \${chargeArrangement === arr ? 'selected' : ''}\`}
                                onClick={() => setChargeArrangement(arr)}
                              >
                                {arr === 'twoAndOne' ? '2 & 1' :
                                 arr === 'oneAndTwo' ? '1 & 2' :
                                 arr === 'pale' ? 'In Pale' :
                                 arr === 'fess' ? 'In Fess' :
                                 arr === 'bend' ? 'In Bend' : arr}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Charge Size */}
                      <div className="option-group">
                        <label>Size</label>
                        <div className="thickness-controls">
                          {Object.entries(CHARGE_SIZES).map(([sizeId, size]) => (
                            <button
                              key={sizeId}
                              type="button"
                              className={\`thickness-button \${chargeSize === sizeId ? 'selected' : ''}\`}
                              onClick={() => setChargeSize(sizeId)}
                            >
                              {size.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL CSS TO ADD TO HeraldryCreator.css
// ═══════════════════════════════════════════════════════════════════════════════

const AdditionalCSS = `
/* External Charges Integration */
.charge-library-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.library-toggle-btn {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid rgba(139, 115, 85, 0.3);
  border-radius: 6px;
  background: rgba(245, 235, 220, 0.5);
  color: #5c4a3a;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.library-toggle-btn:hover {
  background: rgba(139, 94, 60, 0.1);
  border-color: rgba(139, 94, 60, 0.4);
}

.library-toggle-btn.selected {
  background: rgba(139, 94, 60, 0.15);
  border-color: #8b5e3c;
  color: #8b5e3c;
  font-weight: 600;
}

.external-charge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
  gap: 8px;
  margin-top: 12px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
}

.external-charge-preview {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.external-charge-preview:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(139, 94, 60, 0.2);
}

.external-charge-preview.selected {
  box-shadow: 0 0 0 2px #8b5e3c, 0 2px 8px rgba(139, 94, 60, 0.3);
}
`;

export { ChargesSectionJSX, AdditionalCSS };
