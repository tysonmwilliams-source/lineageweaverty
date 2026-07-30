/**
 * Edits one coat of arms: its field, its ordinaries and its charges.
 *
 * Extracted from HeraldryCreator (decision C3, step 5). The creator held
 * `field`, `ordinaries` and `charges` as three pieces of page state and edited
 * them in place, which works for exactly one coat. A marshalled shield has
 * several, so the editing UI has to be pointable at *a node* rather than at the
 * page — and that is the only real change here: this component takes a plain
 * node and returns a new one, instead of calling three setters.
 *
 * Nothing about how a coat is edited changed. The sections, the cards and the
 * limits of three ordinaries and three charges are as they were — including the
 * two emoji in the section headers, which belong to open decision G1 and were
 * deliberately not swapped for icons here. A refactor that also changes what
 * the screen looks like cannot be checked by looking at the screen.
 */
import {
  TINCTURES,
  LINE_STYLES,
  FIELD_DIVISIONS
} from '../../data/heraldicData';
import Icon from '../icons';
import OrdinaryCard from './OrdinaryCard';
import ChargeCard from './ChargeCard';

const MAX_ORDINARIES = 3;
const MAX_CHARGES = 3;

function CoatEditor({ node, onChange, activeSection, onSectionChange }) {
  const { field, ordinaries, charges } = node;

  const currentDivision = FIELD_DIVISIONS[field.division] || {};
  const needsThirdTincture = ['tiercedPale', 'tiercedFess'].includes(field.division);

  // Every mutator below produces a whole new node. That is what lets the same
  // component edit the root coat or a quarter six levels down — the caller
  // decides where the result goes.
  const setField = (updates) => onChange({ ...node, field: { ...field, ...updates } });
  const setOrdinaries = (next) => onChange({ ...node, ordinaries: next });
  const setCharges = (next) => onChange({ ...node, charges: next });

  const toggleSection = (name) => onSectionChange(activeSection === name ? '' : name);

  const addOrdinary = () => {
    if (ordinaries.length >= MAX_ORDINARIES) return;
    setOrdinaries([...ordinaries, {
      type: 'chief',
      tincture: 'or',
      lineStyle: 'straight',
      thickness: 'normal',
      count: 1,
      inverted: false,
      visible: true
    }]);
  };

  const removeOrdinary = (index) => setOrdinaries(ordinaries.filter((_, i) => i !== index));

  const updateOrdinary = (index, updates) =>
    setOrdinaries(ordinaries.map((ord, i) => (i === index ? { ...ord, ...updates } : ord)));

  const moveOrdinaryUp = (index) => {
    if (index === 0) return;
    const next = [...ordinaries];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOrdinaries(next);
  };

  const moveOrdinaryDown = (index) => {
    if (index >= ordinaries.length - 1) return;
    const next = [...ordinaries];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setOrdinaries(next);
  };

  const duplicateOrdinary = (index) => {
    if (ordinaries.length >= MAX_ORDINARIES) return;
    const next = [...ordinaries];
    next.splice(index + 1, 0, { ...ordinaries[index] });
    setOrdinaries(next);
  };

  // `visible` is read as `!== false`, so an item with no flag is visible.
  const toggleOrdinaryVisibility = (index) =>
    setOrdinaries(ordinaries.map((ord, i) =>
      (i === index ? { ...ord, visible: ord.visible === false } : ord)));

  const addCharge = () => {
    if (charges.length >= MAX_CHARGES) return;
    setCharges([...charges, {
      chargeId: 'lion4',
      tincture: 'or',
      size: 'medium',
      count: 1,
      arrangement: 'fessPoint',
      visible: true
    }]);
  };

  const removeCharge = (index) => setCharges(charges.filter((_, i) => i !== index));

  const updateCharge = (index, updates) =>
    setCharges(charges.map((chg, i) => (i === index ? { ...chg, ...updates } : chg)));

  const moveChargeUp = (index) => {
    if (index === 0) return;
    const next = [...charges];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setCharges(next);
  };

  const moveChargeDown = (index) => {
    if (index >= charges.length - 1) return;
    const next = [...charges];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setCharges(next);
  };

  const duplicateCharge = (index) => {
    if (charges.length >= MAX_CHARGES) return;
    const next = [...charges];
    next.splice(index + 1, 0, { ...charges[index] });
    setCharges(next);
  };

  const toggleChargeVisibility = (index) =>
    setCharges(charges.map((chg, i) =>
      (i === index ? { ...chg, visible: chg.visible === false } : chg)));

  return (
    <>
      {/* ── Field ───────────────────────────────────────────────────────── */}
      <section className="design-section">
        <h2
          className={`section-title collapsible ${activeSection === 'field' ? 'active' : ''}`}
          onClick={() => toggleSection('field')}
        >
          <span>🏴 Field (Base Layer)</span>
          <span className="collapse-icon">
            {activeSection === 'field'
              ? <Icon name="chevron-down" size={14} />
              : <Icon name="chevron-right" size={14} />}
          </span>
        </h2>

        {activeSection === 'field' && (
          <>
            <div className="division-grid">
              {Object.entries(FIELD_DIVISIONS).map(([key, div]) => (
                <button
                  key={key}
                  className={`division-option ${field.division === key ? 'selected' : ''}`}
                  onClick={() => setField({ division: key })}
                  title={div.description}
                >
                  <span className="division-icon">{div.icon}</span>
                  <span className="division-name">{div.name}</span>
                </button>
              ))}
            </div>

            <div className="division-options">
              <h3 className="options-title">Field Settings</h3>

              <div className="option-group">
                <label>Primary Tincture</label>
                <div className="tincture-grid">
                  {Object.entries(TINCTURES).map(([key, tinc]) => (
                    <button
                      key={key}
                      type="button"
                      className={`tincture-option ${field.tincture1 === key ? 'selected' : ''}`}
                      onClick={() => setField({ tincture1: key })}
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

              {field.division !== 'plain' && (
                <div className="option-group">
                  <label>Secondary Tincture</label>
                  <div className="tincture-grid">
                    {Object.entries(TINCTURES).map(([key, tinc]) => (
                      <button
                        key={key}
                        type="button"
                        className={`tincture-option ${field.tincture2 === key ? 'selected' : ''}`}
                        onClick={() => setField({ tincture2: key })}
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
              )}

              {needsThirdTincture && (
                <div className="option-group">
                  <label>Tertiary Tincture</label>
                  <div className="tincture-grid">
                    {Object.entries(TINCTURES).map(([key, tinc]) => (
                      <button
                        key={key}
                        type="button"
                        className={`tincture-option ${field.tincture3 === key ? 'selected' : ''}`}
                        onClick={() => setField({ tincture3: key })}
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
              )}

              {currentDivision.supportsLine && (
                <div className="option-group">
                  <label>Line Style</label>
                  <div className="line-style-grid">
                    {Object.entries(LINE_STYLES).map(([key, style]) => (
                      <button
                        key={key}
                        type="button"
                        className={`line-style-option ${field.lineStyle === key ? 'selected' : ''}`}
                        onClick={() => setField({ lineStyle: key })}
                        title={style.description}
                      >
                        {style.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {currentDivision.supportsCount && (
                <div className="option-group">
                  <label>Stripe Count</label>
                  <div className="count-controls">
                    <input
                      type="range"
                      min="4"
                      max="10"
                      step="2"
                      value={field.count}
                      onChange={(e) => setField({ count: parseInt(e.target.value) })}
                      className="count-slider"
                    />
                    <span className="count-value">{field.count} stripes</span>
                  </div>
                </div>
              )}

              {currentDivision.supportsInvert && (
                <div className="option-group">
                  <label className="checkbox-label-container">
                    <input
                      type="checkbox"
                      checked={field.inverted}
                      onChange={(e) => setField({ inverted: e.target.checked })}
                      className="invert-checkbox"
                    />
                    <span className="checkbox-label">Inverted</span>
                  </label>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Ordinaries ──────────────────────────────────────────────────── */}
      <section className="design-section">
        <h2
          className={`section-title collapsible ${activeSection === 'ordinaries' ? 'active' : ''}`}
          onClick={() => toggleSection('ordinaries')}
        >
          <span>▬ Ordinaries ({ordinaries.length}/{MAX_ORDINARIES})</span>
          <span className="collapse-icon">
            {activeSection === 'ordinaries'
              ? <Icon name="chevron-down" size={14} />
              : <Icon name="chevron-right" size={14} />}
          </span>
        </h2>

        {activeSection === 'ordinaries' && (
          <div className="layer-section-content">
            <p className="section-help">
              Ordinaries are geometric shapes placed on the field. Add up to {MAX_ORDINARIES} ordinaries,
              each with their own tincture and options.
            </p>

            <div className="element-cards">
              {ordinaries.map((ordinary, index) => (
                <OrdinaryCard
                  key={index}
                  ordinary={ordinary}
                  index={index}
                  totalCount={ordinaries.length}
                  onUpdate={updateOrdinary}
                  onRemove={removeOrdinary}
                  onMoveUp={moveOrdinaryUp}
                  onMoveDown={moveOrdinaryDown}
                  onDuplicate={duplicateOrdinary}
                  onToggleVisibility={toggleOrdinaryVisibility}
                />
              ))}
            </div>

            {ordinaries.length < MAX_ORDINARIES && (
              <button type="button" className="add-element-btn" onClick={addOrdinary}>
                + Add Ordinary
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Charges ─────────────────────────────────────────────────────── */}
      <section className="design-section">
        <h2
          className={`section-title collapsible ${activeSection === 'charges' ? 'active' : ''}`}
          onClick={() => toggleSection('charges')}
        >
          <span><Icon name="crown" size={14} /> Charges ({charges.length}/{MAX_CHARGES})</span>
          <span className="collapse-icon">
            {activeSection === 'charges'
              ? <Icon name="chevron-down" size={14} />
              : <Icon name="chevron-right" size={14} />}
          </span>
        </h2>

        {activeSection === 'charges' && (
          <div className="layer-section-content">
            <p className="section-help">
              Charges are symbols placed on the shield. Add up to {MAX_CHARGES} charge types,
              each with their own tincture, size, and count.
            </p>

            <div className="element-cards">
              {charges.map((charge, index) => (
                <ChargeCard
                  key={index}
                  charge={charge}
                  index={index}
                  totalCount={charges.length}
                  onUpdate={updateCharge}
                  onRemove={removeCharge}
                  onMoveUp={moveChargeUp}
                  onMoveDown={moveChargeDown}
                  onDuplicate={duplicateCharge}
                  onToggleVisibility={toggleChargeVisibility}
                />
              ))}
            </div>

            {charges.length < MAX_CHARGES && (
              <button type="button" className="add-element-btn" onClick={addCharge}>
                + Add Charge
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

export default CoatEditor;
