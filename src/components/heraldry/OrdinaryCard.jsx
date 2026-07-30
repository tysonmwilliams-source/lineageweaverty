/**
 * Collapsible card for editing one ordinary.
 *
 * Extracted from HeraldryCreator (decision C3, step 5) so that the coat-editing
 * UI can be pointed at any node of a composition rather than only at the page's
 * single coat. Purely presentational — every mutation goes back through the
 * callbacks — so it did not have to change to move.
 */
import { useState } from 'react';
import { TINCTURES, LINE_STYLES, ORDINARIES } from '../../data/heraldicData';
import Icon from '../icons';

function OrdinaryCard({ 
  ordinary, 
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
  const ordinaryDef = ORDINARIES[ordinary.type];
  const tinctureDef = TINCTURES[ordinary.tincture];
  const isVisible = ordinary.visible !== false;
  
  const summaryText = `${ordinaryDef?.name || ordinary.type} — ${tinctureDef?.name.split(' ')[0] || ordinary.tincture}${ordinary.lineStyle !== 'straight' ? `, ${LINE_STYLES[ordinary.lineStyle]?.name}` : ''}`;
  
  return (
    <div className={`element-card ${!isVisible ? 'hidden-layer' : ''}`}>
      <div className="element-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="element-card-icon">{ordinaryDef?.icon || '▬'}</span>
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
            title="Duplicate this ordinary"
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
            title="Remove this ordinary"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <span className="element-card-expand">{expanded ? <Icon name="chevron-down" size={14} /> : <Icon name="chevron-right" size={14} />}</span>
      </div>
      
      {expanded && (
        <div className="element-card-body">
          {/* Type Selector */}
          <div className="element-option">
            <label>Type</label>
            <div className="element-type-grid">
              {Object.entries(ORDINARIES).map(([key, ord]) => (
                <button
                  key={key}
                  type="button"
                  className={`element-type-btn ${ordinary.type === key ? 'selected' : ''}`}
                  onClick={() => onUpdate(index, { type: key })}
                  title={ord.description}
                >
                  <span className="type-icon">{ord.icon}</span>
                  <span className="type-name">{ord.name}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Tincture */}
          <div className="element-option">
            <label>Tincture</label>
            <div className="tincture-grid compact">
              {Object.entries(TINCTURES).map(([key, tinc]) => (
                <button
                  key={key}
                  type="button"
                  className={`tincture-option ${ordinary.tincture === key ? 'selected' : ''}`}
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
          
          {/* Line Style */}
          {ordinaryDef?.supportsLine && (
            <div className="element-option">
              <label>Line Style</label>
              <div className="line-style-grid">
                {Object.entries(LINE_STYLES).map(([key, style]) => (
                  <button
                    key={key}
                    type="button"
                    className={`line-style-option ${ordinary.lineStyle === key ? 'selected' : ''}`}
                    onClick={() => onUpdate(index, { lineStyle: key })}
                    title={style.description}
                  >
                    {style.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Thickness */}
          {ordinaryDef?.supportsThickness && (
            <div className="element-option">
              <label>Thickness</label>
              <div className="thickness-controls">
                {['narrow', 'normal', 'wide'].map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`thickness-button ${ordinary.thickness === t ? 'selected' : ''}`}
                    onClick={() => onUpdate(index, { thickness: t })}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Count */}
          {ordinaryDef?.supportsCount && (
            <div className="element-option">
              <label>Count</label>
              <div className="count-controls">
                {[1, 2, 3].map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`count-button ${ordinary.count === num ? 'selected' : ''}`}
                    onClick={() => onUpdate(index, { count: num })}
                    disabled={ordinaryDef.maxCount && num > ordinaryDef.maxCount}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Inverted */}
          {ordinaryDef?.supportsInvert && (
            <div className="element-option">
              <label className="checkbox-label-container">
                <input
                  type="checkbox"
                  checked={ordinary.inverted || false}
                  onChange={(e) => onUpdate(index, { inverted: e.target.checked })}
                  className="invert-checkbox"
                />
                <span className="checkbox-label">
                  Inverted {ordinary.type === 'pile' ? '(Reversed)' : ''}
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OrdinaryCard;
