import React, { useState } from 'react';
import Modal from './Modal';
import { createArmoriaHeraldryForHouse, generateRandomSeed } from '../utils/armoriaIntegration';
import { createSimpleHeraldryForHouse } from '../utils/simpleHeraldryGenerator';
import { updateHouse } from '../services/database';

/**
 * HeraldryCreationModal Component - PHASE 2 VERSION
 * 
 * Modal for creating and managing house heraldry.
 * Phase 2: Armoria tab fully functional with professional shields
 * 
 * Props:
 * - house: House object to create heraldry for
 * - onClose: Function to close modal
 * - onSave: Function called when heraldry is saved
 * - isDarkTheme: Theme preference
 */
function HeraldryCreationModal({ 
  house, 
  onClose, 
  onSave,
  isDarkTheme = true 
}) {
  const [activeTab, setActiveTab] = useState('armoria');
  const [selectedShieldType, setSelectedShieldType] = useState(house?.heraldryShieldType || 'heater');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewSVG, setPreviewSVG] = useState(null);
  const [customSeed, setCustomSeed] = useState(null);
  const [generatedHeraldry, setGeneratedHeraldry] = useState(null);
  const [useSimpleMode, setUseSimpleMode] = useState(true); // Default to simple (always works)
  
  if (!house) return null;
  
  const theme = isDarkTheme ? {
    bg: '#2d2418',
    bgLight: '#3a2f20',
    text: '#e9dcc9',
    textSecondary: '#b8a989',
    border: '#4a3d2a',
    accent: '#c9a227',           // Golden accent matching theme
    accentHover: '#a88620',      // Darker hover state
    accentText: '#1a1410',       // Dark text on accent buttons
    tab: '#3a2f20',
    tabActive: '#4a3d2a'
  } : {
    bg: '#ede7dc',
    bgLight: '#f5ede0',
    text: '#2d2418',
    textSecondary: '#4a3d2a',
    border: '#d4c4a4',
    accent: '#b8874a',           // Rich gold for light theme
    accentHover: '#9a6f3a',      // Darker hover state
    accentText: '#ffffff',       // White text on accent buttons
    tab: '#e5dfd0',
    tabActive: '#d4c4a4'
  };
  
  const tabs = [
    { id: 'armoria', label: '🛡️ Quick Generate', subtitle: 'Instant via Armoria' },
    { id: 'whisk', label: '🤖 AI Custom', subtitle: 'Google Whisk (Phase 3)' },
    { id: 'upload', label: '📤 Manual Upload', subtitle: 'Your own image (Phase 3)' }
  ];
  
  const shieldTypes = [
    { id: 'heater', name: 'Heater', description: 'Classic 1245' },
    { id: 'english', name: 'English', description: 'Late medieval 1403' },
    { id: 'french', name: 'French', description: 'Embowed/arched' },
    { id: 'spanish', name: 'Spanish', description: 'Engrailed notched' },
    { id: 'swiss', name: 'Swiss', description: 'Engrailed peaked' }
  ];
  
  // Armoria generation handler (supports both simple and Armoria modes)
  const handleGenerateArmoria = async () => {
    setIsProcessing(true);
    
    try {
      let heraldryData;
      
      if (useSimpleMode) {
        // Use simple generator (always works, no API required)
        heraldryData = await createSimpleHeraldryForHouse(
          { ...house, heraldryShieldType: selectedShieldType },
          customSeed
        );
      } else {
        // Use Armoria API (more complex, but requires network)
        heraldryData = await createArmoriaHeraldryForHouse(
          { ...house, heraldryShieldType: selectedShieldType },
          customSeed
        );
      }
      
      setGeneratedHeraldry(heraldryData);
      setPreviewSVG(heraldryData.heraldrySVG);
      
      console.log('✅ Heraldry generated successfully');
    } catch (error) {
      console.error('❌ Failed to generate heraldry:', error);
      alert('Failed to generate heraldry. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Randomize seed and regenerate
  const handleRandomize = () => {
    const newSeed = generateRandomSeed();
    setCustomSeed(newSeed);
    console.log('🎲 Randomizing with seed:', newSeed);
  };
  
  // Save generated heraldry to database
  const handleSaveHeraldry = async () => {
    if (!generatedHeraldry) {
      alert('Please generate heraldry first');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Update house with heraldry data
      await updateHouse(house.id, generatedHeraldry);
      
      console.log('✅ Heraldry saved to database');
      
      // Call parent save handler
      if (onSave) {
        onSave(generatedHeraldry);
      }
      
      alert(`✅ Heraldry saved for ${house.houseName}!`);
      
      // Close modal
      onClose();
      
    } catch (error) {
      console.error('❌ Failed to save heraldry:', error);
      alert('Failed to save heraldry. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <Modal isOpen={true} onClose={onClose} title="Create House Heraldry">
      <div style={{
        backgroundColor: theme.bg,
        color: theme.text,
        padding: '24px',
        borderRadius: '8px',
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '24px',
            color: theme.text,
            fontFamily: 'serif'
          }}>
            Create House Heraldry
          </h2>
          <p style={{ 
            margin: 0, 
            color: theme.textSecondary,
            fontSize: '14px'
          }}>
            {house.houseName}
          </p>
        </div>
        
        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: `2px solid ${theme.border}`
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: activeTab === tab.id ? theme.tabActive : theme.tab,
                border: 'none',
                borderBottom: activeTab === tab.id ? `3px solid ${theme.accent}` : 'none',
                color: theme.text,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                transition: 'all 0.2s ease',
                textAlign: 'left'
              }}
            >
              <div>{tab.label}</div>
              <div style={{ 
                fontSize: '11px', 
                color: theme.textSecondary,
                marginTop: '4px'
              }}>
                {tab.subtitle}
              </div>
            </button>
          ))}
        </div>
        
        {/* Shield Type Selector (applies to all tabs) */}
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: theme.bgLight,
          borderRadius: '4px',
          border: `1px solid ${theme.border}`
        }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            color: theme.text
          }}>
            Shield Shape (Professional Heraldic Art)
          </label>
          <select
            value={selectedShieldType}
            onChange={(e) => setSelectedShieldType(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: theme.bg,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '4px',
              fontSize: '14px'
            }}
          >
            {shieldTypes.map(type => (
              <option key={type.id} value={type.id}>
                {type.name} - {type.description}
              </option>
            ))}
          </select>
        </div>
        
        {/* Tab Content */}
        {activeTab === 'armoria' && (
          <div style={{
            minHeight: '400px',
            padding: '24px',
            backgroundColor: theme.bgLight,
            borderRadius: '4px',
            border: `1px solid ${theme.border}`
          }}>
            <h3 style={{ 
              margin: '0 0 16px 0',
              color: theme.text,
              fontSize: '18px',
              textAlign: 'center'
            }}>
              🛡️ Armoria Quick Generate
            </h3>
            
            {/* Mode Toggle */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              padding: '8px',
              backgroundColor: theme.bg,
              borderRadius: '4px'
            }}>
              <label style={{
                fontSize: '13px',
                color: theme.text,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={useSimpleMode}
                  onChange={(e) => setUseSimpleMode(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>
                  {useSimpleMode ? '🟢 Simple Mode (Traditional Patterns)' : '🟡 Armoria API Mode (Complex)'}
                </span>
              </label>
            </div>
            
            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '24px',
              justifyContent: 'center'
            }}>
              <button
                onClick={handleGenerateArmoria}
                disabled={isProcessing}
                style={{
                  padding: '12px 24px',
                  backgroundColor: theme.accent,
                  color: theme.accentText,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  opacity: isProcessing ? 0.6 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                {isProcessing ? '⏳ Generating...' : '✨ Generate Heraldry'}
              </button>
              
              <button
                onClick={handleRandomize}
                disabled={isProcessing}
                style={{
                  padding: '12px 24px',
                  backgroundColor: theme.bg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '4px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  opacity: isProcessing ? 0.6 : 1
                }}
              >
                🎲 Randomize
              </button>
            </div>
            
            {/* Preview */}
            <div style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              {previewSVG ? (
                <div 
                  style={{
                    width: '250px',
                    height: '300px',
                    border: `2px solid ${theme.border}`,
                    borderRadius: '8px',
                    overflow: 'visible',
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <div 
                    dangerouslySetInnerHTML={{ __html: previewSVG }}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  />
                </div>
              ) : (
                <div style={{
                  width: '200px',
                  height: '200px',
                  backgroundColor: theme.bg,
                  border: `2px dashed ${theme.border}`,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.textSecondary,
                  fontSize: '14px',
                  textAlign: 'center',
                  padding: '20px'
                }}>
                  Click "Generate Heraldry" to create procedural coat of arms
                </div>
              )}
            </div>
            
            {/* Info */}
            <div style={{
              padding: '12px',
              backgroundColor: `${theme.accent}22`,
              border: `1px solid ${theme.accent}`,
              borderRadius: '4px',
              fontSize: '12px',
              color: theme.textSecondary
            }}>
              <strong>ℹ️ About Armoria:</strong> Generates procedural heraldry using historical heraldic rules. Each house gets a unique design based on its name. Click "Randomize" to see variations. Generated as SVG for infinite zoom quality (1x to 300x).
            </div>
          </div>
        )}
        
        {/* Placeholder for other tabs */}
        {activeTab !== 'armoria' && (
          <div style={{
            minHeight: '400px',
            padding: '24px',
            backgroundColor: theme.bgLight,
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {activeTab === 'whisk' && '🤖'}
              {activeTab === 'upload' && '📤'}
            </div>
            <h3 style={{ 
              margin: '0 0 8px 0',
              color: theme.text,
              fontSize: '18px'
            }}>
              {tabs.find(t => t.id === activeTab)?.label}
            </h3>
            <p style={{ 
              margin: '0',
              color: theme.textSecondary,
              fontSize: '14px',
              maxWidth: '400px'
            }}>
              This tab will be implemented in Phase 3.
            </p>
          </div>
        )}
        
        {/* Footer Buttons */}
        <div style={{
          marginTop: '24px',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: theme.bgLight,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveHeraldry}
            disabled={!generatedHeraldry || isProcessing}
            style={{
              padding: '10px 20px',
              backgroundColor: generatedHeraldry && !isProcessing ? theme.accent : theme.border,
              color: generatedHeraldry && !isProcessing ? theme.accentText : theme.textSecondary,
              border: 'none',
              borderRadius: '4px',
              cursor: generatedHeraldry && !isProcessing ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 'bold',
              opacity: generatedHeraldry && !isProcessing ? 1 : 0.6,
              transition: 'all 0.2s ease'
            }}
            title={generatedHeraldry ? 'Save heraldry to house' : 'Generate heraldry first'}
          >
            💾 Save Heraldry
          </button>
        </div>
        
      </div>
    </Modal>
  );
}

export default HeraldryCreationModal;
