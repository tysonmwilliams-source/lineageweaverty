/**
 * Collapsible card for editing one charge, including the charge picker.
 *
 * Extracted from HeraldryCreator (decision C3, step 5). Purely presentational:
 * every mutation goes back through the callbacks, which is why it moved without
 * changing.
 */
import { useState } from 'react';
import { TINCTURES, CHARGE_SIZES, CHARGE_ARRANGEMENTS } from '../../data/heraldicData';
import {
  CHARGES,
  CHARGE_CATEGORIES,
  getChargesByCategory,
  searchCharges
} from '../../data/unifiedChargesLibrary';
import ListSearchBar from '../shared/ListSearchBar';
import ExternalChargeRenderer from './ExternalChargeRenderer';
import LazyChargePreview from './LazyChargePreview';
import Icon from '../icons';

function ChargeCard({ 
  charge, 
  index, 
  totalCount,
  onUpdate, 
  onRemove,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleVisibility
}) {
  const [expanded, setExpanded] = useState(true);
  const [activeCategory, setActiveCategory] = useState(() => {
    const chargeData = CHARGES[charge.chargeId];
    return chargeData?.category || 'beasts';
  });
  // Searching spans the whole library — 287 charges across 17 categories is far
  // too many to find anything by clicking through tabs, which was the only way
  // to browse them. searchCharges() matches name, blazon term, description and
  // keywords, so "bird" finds the martlet and "war" finds the sword.
  const [chargeSearch, setChargeSearch] = useState('');

  const chargeData = CHARGES[charge.chargeId];
  const tinctureDef = TINCTURES[charge.tincture];
  const sizeDef = CHARGE_SIZES[charge.size];
  const isVisible = charge.visible !== false;
  
  const summaryText = `${chargeData?.name || charge.chargeId} — ${tinctureDef?.name.split(' ')[0] || charge.tincture}, ${sizeDef?.name || charge.size}`;
  
  const trimmedSearch = chargeSearch.trim();
  const isSearching = trimmedSearch.length > 0;
  const visibleCharges = isSearching
    ? searchCharges(trimmedSearch)
    : getChargesByCategory(activeCategory);
  const visibleChargeCount = Object.keys(visibleCharges).length;

  return (
    <div className={`element-card ${!isVisible ? 'hidden-layer' : ''}`}>
      <div className="element-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="element-card-icon"><Icon name="crown" /></span>
        <span className="element-card-summary">{summaryText}</span>
        
        {/* Layer Controls */}
        <div className="element-card-controls" onClick={(e) => e.stopPropagation()}>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            title="Move up (render earlier)"
          >
            <Icon name="chevron-up" size={14} />
          </button>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onMoveDown(index)}
            disabled={index >= totalCount - 1}
            title="Move down (render later)"
          >
            <Icon name="chevron-down" size={14} />
          </button>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onDuplicate(index)}
            disabled={totalCount >= 3}
            title="Duplicate this charge"
          >
            <Icon name="copy" size={14} />
          </button>
          <button 
            type="button"
            className={`element-control-btn ${!isVisible ? 'toggled-off' : ''}`}
            onClick={() => onToggleVisibility(index)}
            title={isVisible ? 'Hide from preview' : 'Show in preview'}
          >
            {isVisible ? <Icon name="eye" size={14} /> : <Icon name="eye-off" size={14} />}
          </button>
          <button 
            type="button"
            className="element-card-remove" 
            onClick={() => onRemove(index)}
            title="Remove this charge"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <span className="element-card-expand">{expanded ? <Icon name="chevron-down" size={14} /> : <Icon name="chevron-right" size={14} />}</span>
      </div>
      
      {expanded && (
        <div className="element-card-body">
          {/* Search — spans all categories */}
          <div className="element-option">
            <label>Find a charge</label>
            <ListSearchBar
              value={chargeSearch}
              onChangeDebounced={setChargeSearch}
              placeholder="Search 287 charges by name, blazon or keyword…"
            />
          </div>

          {/* Category Tabs — hidden while searching, since results span categories */}
          {!isSearching && (
            <div className="element-option">
              <label>Category</label>
              <div className="charge-category-tabs">
                {Object.entries(CHARGE_CATEGORIES).map(([catId, cat]) => (
                  <button
                    key={catId}
                    type="button"
                    className={`line-style-option ${activeCategory === catId ? 'selected' : ''}`}
                    onClick={() => setActiveCategory(catId)}
                    title={cat.description}
                  >
                    <span>{cat.icon}</span> {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Charge Grid */}
          <div className="element-option">
            <label>
              {isSearching
                ? `${visibleChargeCount} ${visibleChargeCount === 1 ? 'match' : 'matches'} for “${trimmedSearch}”`
                : 'Select Charge'}
            </label>
            {isSearching && visibleChargeCount === 0 ? (
              <p className="charge-search-empty">
                No charges match “{trimmedSearch}”. Try a broader term — searches
                cover the blazon term and keywords, not just the name.
              </p>
            ) : (
              <div className="unified-charge-grid">
                {Object.entries(visibleCharges).map(([id]) => (
                  <LazyChargePreview
                    key={id}
                    chargeId={id}
                    tincture={TINCTURES[charge.tincture]?.hex || '#000000'}
                    size={45}
                    selected={charge.chargeId === id}
                    onClick={(chargeId) => onUpdate(index, { chargeId })}
                    showName={true}
                  />
                ))}
              </div>
            )}
          </div>
          
          {/* Tincture */}
          <div className="element-option">
            <label>Tincture</label>
            <div className="tincture-grid compact">
              {Object.entries(TINCTURES).map(([key, tinc]) => (
                <button
                  key={key}
                  type="button"
                  className={`tincture-option ${charge.tincture === key ? 'selected' : ''}`}
                  onClick={() => onUpdate(index, { tincture: key })}
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
          
          {/* Size */}
          <div className="element-option">
            <label>Size</label>
            <div className="thickness-controls">
              {Object.entries(CHARGE_SIZES).map(([sizeId, size]) => (
                <button
                  key={sizeId}
                  type="button"
                  className={`thickness-button ${charge.size === sizeId ? 'selected' : ''}`}
                  onClick={() => onUpdate(index, { size: sizeId })}
                >
                  {size.name}
                </button>
              ))}
            </div>
          </div>
          
          {/* Count */}
          <div className="element-option">
            <label>Number of Charges</label>
            <div className="count-controls">
              {[1, 2, 3].map(num => (
                <button
                  key={num}
                  type="button"
                  className={`count-button ${charge.count === num ? 'selected' : ''}`}
                  onClick={() => {
                    const updates = { count: num };
                    if (num === 1) updates.arrangement = 'fessPoint';
                    else if (num === 2) updates.arrangement = 'pale';
                    else updates.arrangement = 'twoAndOne';
                    onUpdate(index, updates);
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
          
          {/* Arrangement */}
          {charge.count > 1 && (
            <div className="element-option">
              <label>Arrangement</label>
              <div className="thickness-controls">
                {Object.keys(CHARGE_ARRANGEMENTS[charge.count] || {}).map(arr => (
                  <button
                    key={arr}
                    type="button"
                    className={`thickness-button ${charge.arrangement === arr ? 'selected' : ''}`}
                    onClick={() => onUpdate(index, { arrangement: arr })}
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
        </div>
      )}
    </div>
  );
}

export default ChargeCard;
