# Phase 3B: External Charges Integration - Complete Handoff

## Overview

This phase adds support for 82 high-quality heraldic SVG charges from the Traceable Heraldic Art collection (public domain/CC0). These are detailed, multi-element SVGs that provide much richer visual variety than the basic path-based charges.

## Files Created

### 1. `/src/data/externalChargesLibrary.js` ✅
Complete catalog of all 82 external charges with:
- Category organization (Weapons, Flora, Creatures, Military)
- Metadata for each charge (name, description, blazon term, keywords)
- Helper functions for searching, filtering, and generating blazons

### 2. `/src/components/heraldry/ExternalChargeRenderer.jsx` ✅
React component that:
- Fetches external SVG files dynamically
- Applies tincture colors by replacing white fills
- Handles aspect ratio preservation
- Provides both display component and SVG generation utilities

### 3. `/src/pages/HeraldryCreator.css` ✅ (Updated)
Added CSS for:
- Charge library toggle buttons
- External charge grid with scrolling
- Custom scrollbar styling
- Responsive breakpoints

### 4. `/src/docs/HeraldryCreator_ExternalCharges_Patch.js`
Documentation of all code changes needed for HeraldryCreator.jsx

### 5. `/src/docs/HeraldryCreator_ChargesSection_Update.jsx`
Complete replacement JSX for the charges section

## Manual Step Required

**Copy SVG files to public folder:**
```bash
cp /Users/tywilliams/Desktop/lineageweaver/extras/heraldic-svgs/*.svg /Users/tywilliams/Desktop/lineageweaver/public/heraldic-charges/
```

## Integration Steps for HeraldryCreator.jsx

### Step 1: Add Imports

At the top of the file, after existing imports, add:

```javascript
import {
  EXTERNAL_CHARGES,
  EXTERNAL_CHARGE_CATEGORIES,
  getExternalChargesByCategory,
  generateExternalChargeBlazon
} from '../data/externalChargesLibrary';
import ExternalChargeRenderer, {
  generateExternalChargeSVGAsync,
  ExternalChargePreview
} from '../components/heraldry/ExternalChargeRenderer';
```

### Step 2: Add State Variables

In the HeraldryCreator component, after the existing charge state variables (around line 632), add:

```javascript
  // External charge options
  const [useExternalCharge, setUseExternalCharge] = useState(false);
  const [externalChargeId, setExternalChargeId] = useState('rose8');
  const [activeExternalCategory, setActiveExternalCategory] = useState('flora');
```

### Step 3: Update generatePreview Function

Find the `generatePreview` function and replace the charge handling section (where it says `// Add charge if enabled`) with:

```javascript
      // Add charge if enabled
      if (chargeEnabled && (chargeId || (useExternalCharge && externalChargeId))) {
        const chargeHex = TINCTURES[chargeTincture]?.hex || chargeTincture;
        const sizeScale = CHARGE_SIZES[chargeSize]?.scale || 0.7;
        
        let chargeSVGContent = '';
        
        if (useExternalCharge && externalChargeId) {
          // Use external charge
          if (chargeCount === 1) {
            chargeSVGContent = await generateExternalChargeSVGAsync(
              externalChargeId, 
              chargeHex, 
              100, 90, 
              sizeScale
            );
          } else {
            // Multiple external charges
            const arrangements = CHARGE_ARRANGEMENTS[chargeCount];
            const arrangementKey = chargeArrangement || Object.keys(arrangements)[0];
            const positions = arrangements[arrangementKey];
            
            const chargePromises = positions.map(pos =>
              generateExternalChargeSVGAsync(
                externalChargeId,
                chargeHex,
                pos.x,
                pos.y,
                sizeScale * 0.7 // Smaller when multiple
              )
            );
            
            const chargeResults = await Promise.all(chargePromises);
            chargeSVGContent = chargeResults.join('');
          }
        } else if (chargeId) {
          // Use basic charge (existing logic)
          if (chargeCount === 1) {
            chargeSVGContent = generateChargeSVG(chargeId, chargeHex, 100, 90, sizeScale);
          } else {
            const arrangements = CHARGE_ARRANGEMENTS[chargeCount];
            const arrangementKey = chargeArrangement || Object.keys(arrangements)[0];
            chargeSVGContent = generateChargeArrangementSVG(
              chargeId, 
              chargeHex, 
              chargeCount, 
              arrangementKey, 
              sizeScale
            );
          }
        }
        
        // Insert charge before closing </svg> tag
        if (chargeSVGContent) {
          divSVG = divSVG.replace('</svg>', `${chargeSVGContent}</svg>`);
        }
      }
```

### Step 4: Update Blazon Generation

Replace the blazon generation for charges with:

```javascript
      if (chargeEnabled) {
        const chargeTinctureName = TINCTURES[chargeTincture]?.name.split(' ')[0] || chargeTincture;
        
        let chargeBlazonPart;
        if (useExternalCharge && externalChargeId) {
          chargeBlazonPart = generateExternalChargeBlazon(externalChargeId, chargeTinctureName, chargeCount);
        } else if (chargeId) {
          chargeBlazonPart = generateChargeBlazon(chargeId, chargeTinctureName, chargeCount);
        }
        
        if (chargeBlazonPart) {
          newBlazon = `${newBlazon}, ${chargeBlazonPart}`;
        }
      }
```

### Step 5: Update generatePreview Dependencies

Add `useExternalCharge` and `externalChargeId` to the useCallback dependency array:

```javascript
  }, [division, tincture1, tincture2, tincture3, shieldType, lineStyle, divisionCount, 
      thickness, inverted, chargeEnabled, chargeId, chargeTincture, chargeCount, 
      chargeArrangement, chargeSize, useExternalCharge, externalChargeId]);
```

### Step 6: Replace Charges Section JSX

Find the `{/* Charges */}` section (around line 950) and replace the entire `<section className="design-section">` for charges with the following:

```jsx
            {/* Charges */}
            <section className="design-section">
              <h2 
                className={`section-title collapsible ${activeSection === 'charges' ? 'active' : ''}`}
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
                            className={`library-toggle-btn ${!useExternalCharge ? 'selected' : ''}`}
                            onClick={() => setUseExternalCharge(false)}
                          >
                            🎨 Basic Charges
                          </button>
                          <button
                            type="button"
                            className={`library-toggle-btn ${useExternalCharge ? 'selected' : ''}`}
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
                                className={`line-style-option ${activeChargeCategory === catId ? 'selected' : ''}`}
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
                                  className={`division-option ${chargeId === id ? 'selected' : ''}`}
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
                                className={`line-style-option ${activeExternalCategory === catId ? 'selected' : ''}`}
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
                              className={`tincture-option ${chargeTincture === key ? 'selected' : ''}`}
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
                              className={`count-button ${chargeCount === num ? 'selected' : ''}`}
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
                                className={`thickness-button ${chargeArrangement === arr ? 'selected' : ''}`}
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
                              className={`thickness-button ${chargeSize === sizeId ? 'selected' : ''}`}
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
```

### Step 7: Update handleSave Composition Data

In the `handleSave` function, add these fields to the `composition` object:

```javascript
          // External charge data
          useExternalCharge: chargeEnabled ? useExternalCharge : false,
          externalChargeId: (chargeEnabled && useExternalCharge) ? externalChargeId : null,
```

### Step 8: Update loadInitialData

In `loadInitialData`, after restoring basic charge settings, add:

```javascript
            // Restore external charge settings
            if (heraldry.composition.useExternalCharge) {
              setUseExternalCharge(true);
              setExternalChargeId(heraldry.composition.externalChargeId || 'rose8');
            }
```

---

## Testing Checklist

After integration:

- [ ] SVGs copied to `/public/heraldic-charges/` (82 files)
- [ ] App compiles without errors
- [ ] Charges section shows toggle between Basic and Detailed
- [ ] Basic charges still work as before
- [ ] External charge categories display (Weapons, Flora, Creatures, Military)
- [ ] Selecting external charge shows preview with correct tincture
- [ ] Shield preview updates when external charge is selected
- [ ] Multiple external charges (2, 3) render correctly
- [ ] Blazon generates correctly for external charges
- [ ] Saving heraldry with external charge works
- [ ] Editing existing heraldry with external charge restores state correctly

---

## External Charge Categories

| Category | Count | Examples |
|----------|-------|----------|
| Weapons | 22 | Swords, daggers, axes, bows, maces, lances |
| Flora | 46 | Roses, oak leaves, wheat, trees, wreaths, fruits |
| Creatures | 8 | Bees, serpents, ants |
| Military | 6 | Helms, gauntlets, breastplate, pennons, arrows |

---

## Technical Notes

### SVG Color Application

The external SVGs use:
- `fill="#FFFFFF"` for main coloring areas
- `stroke="black"` for outlines

The `ExternalChargeRenderer` replaces white fills with the selected tincture color while preserving black strokes for definition.

### Aspect Ratio Handling

External SVGs have varying aspect ratios (e.g., swords are tall and narrow, bees are wide). The renderer:
1. Extracts the viewBox dimensions
2. Calculates appropriate scaling to fit within the charge area
3. Preserves the aspect ratio
4. Centers the charge at the specified position

### Performance Considerations

- SVGs are fetched on-demand when selected
- The `useExternalChargeSVG` hook can pre-cache SVGs for faster rendering
- For final shield generation, `generateExternalChargeSVGAsync` fetches and processes the SVG

---

## Future Enhancements

Potential Phase 3C additions:
- Search/filter functionality for charges
- Charge rotation options
- Secondary tincture for multi-color charges
- Charge positioning fine-tuning
- Favorite/recent charges list
