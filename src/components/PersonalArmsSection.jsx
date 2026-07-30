/**
 * PersonalArmsSection.jsx
 * 
 * QuickEditPanel component for displaying and managing personal heraldry.
 * Shows the person's personal arms if they have them, or provides options
 * to create personal arms derived from their house's heraldry with cadency marks.
 * 
 * PHASE 4 FEATURE: Personal Arms & Cadency
 * 
 * This component:
 * 1. Displays existing personal arms if present
 * 2. Shows eligibility status for cadency (legitimate male descendants)
 * 3. Provides "Create Personal Arms" workflow for eligible individuals
 * 4. Shows birth order position and cadency triangle preview
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataset } from '../contexts/DatasetContext';
import {
  getPersonalArms,
  hasPersonalArms,
  getHeraldryForEntity,
  getHeraldry
} from '../services/heraldryService';
import { sanitizeSVG } from '../utils/sanitize';
import {
  calculateBirthOrder,
  getBirthOrderLabel,
  isEligibleForCadency,
  getCadencySummary
} from '../utils/birthOrderUtils';
import {
  createPersonalArmsSVG,
  addCadencyToSVG
} from '../utils/personalArmsRenderer';
import { logger } from '../utils/logger';
import Icon from './icons';

/**
 * PersonalArmsSection Component
 * 
 * @param {Object} props
 * @param {Object} props.person - The person record
 * @param {Object} props.house - The person's house record
 * @param {Array} props.allPeople - All people for birth order calculation
 * @param {Array} props.allRelationships - All relationships for birth order calculation
 * @param {boolean} props.isDarkTheme - Theme toggle
 * @param {Function} props.onArmsCreated - Callback when personal arms are created
 */
function PersonalArmsSection({
  person,
  house,
  allPeople = [],
  allRelationships = [],
  isDarkTheme = true,
  onArmsCreated
}) {
  const navigate = useNavigate();
  const { activeDataset } = useDataset();
  
  // ==================== STATE ====================
  const [personalArms, setPersonalArms] = useState(null);
  const [houseHeraldry, setHouseHeraldry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewSVG, setPreviewSVG] = useState(null);
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  
  // ==================== THEME ====================
  const theme = isDarkTheme ? {
    bg: '#2d2418',
    bgLight: '#3a2f20',
    bgLighter: '#4a3d2a',
    text: '#e9dcc9',
    textSecondary: '#b8a989',
    border: '#4a3d2a',
    accent: '#d4a574',
    success: '#6b8e5e',
    warning: '#c4a44e',
    danger: '#a65d5d'
  } : {
    bg: '#ede7dc',
    bgLight: '#e5dfd0',
    bgLighter: '#d8d0c0',
    text: '#2d2418',
    textSecondary: '#4a3d2a',
    border: '#d4c4a4',
    accent: '#b8874a',
    success: '#5a7a4a',
    warning: '#a08030',
    danger: '#8a4a4a'
  };

  // ==================== COMPUTED VALUES ====================
  
  // Calculate birth order for cadency
  const birthOrderResult = useMemo(() => {
    if (!person || !allPeople.length || !allRelationships.length) {
      return null;
    }
    return calculateBirthOrder(person, allPeople, allRelationships);
  }, [person, allPeople, allRelationships]);
  
  // Check eligibility
  const eligible = useMemo(() => {
    return isEligibleForCadency(person);
  }, [person]);
  
  // Get cadency summary for display
  const cadencySummary = useMemo(() => {
    if (!birthOrderResult) return null;
    return getCadencySummary(birthOrderResult);
  }, [birthOrderResult]);

  // ==================== EFFECTS ====================

  // Load personal arms and house heraldry
  useEffect(() => {
    loadArmsData();
  }, [person?.id, house?.id, activeDataset]);

  async function loadArmsData() {
    if (!person?.id) {
      setLoading(false);
      return;
    }

    const datasetId = activeDataset?.id;
    setLoading(true);

    try {
      // Check for existing personal arms
      const arms = await getPersonalArms(person.id, datasetId);
      setPersonalArms(arms);

      // Load house heraldry for preview/creation
      if (house?.heraldryId) {
        const houseArms = await getHeraldry(house.heraldryId, datasetId);
        setHouseHeraldry(houseArms);

        // Generate preview with cadency if eligible and has birth position
        if (!arms && houseArms && birthOrderResult?.isEligible && birthOrderResult?.position) {
          const result = createPersonalArmsSVG(houseArms, birthOrderResult.position);
          if (result.success) {
            setPreviewSVG(result.svg);
          }
        }
      }
    } catch (error) {
      logger.error('Error loading arms data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  // Update preview when birth order changes
  useEffect(() => {
    if (houseHeraldry && birthOrderResult?.isEligible && birthOrderResult?.position && !personalArms) {
      const result = createPersonalArmsSVG(houseHeraldry, birthOrderResult.position);
      if (result.success) {
        setPreviewSVG(result.svg);
      }
    }
  }, [houseHeraldry, birthOrderResult, personalArms]);

  // ==================== HANDLERS ====================
  
  function handleViewArms() {
    if (personalArms?.id) {
      navigate(`/heraldry/edit/${personalArms.id}`);
    }
  }
  
  function handleCreateArms() {
    // Navigate to heraldry creator with person context
    // The creator will handle the cadency application
    navigate(`/heraldry/create?personId=${person.id}&deriveFrom=${house?.heraldryId || ''}&birthPosition=${birthOrderResult?.position || 1}`);
  }
  
  function handleViewHouseArms() {
    if (house?.heraldryId) {
      navigate(`/heraldry/edit/${house.heraldryId}`);
    }
  }

  // ==================== RENDER ====================
  
  if (loading) {
    return (
      <section>
        <h3 
          className="font-semibold mb-2 text-xs uppercase tracking-wider flex items-center gap-2" 
          style={{ color: theme.textSecondary }}
        >
          <Icon name="shield" /> Personal Arms
        </h3>
        <div 
          className="p-3 rounded border text-center text-sm"
          style={{ backgroundColor: theme.bgLight, borderColor: theme.border, color: theme.textSecondary }}
        >
          Loading...
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 
        className="font-semibold mb-2 text-xs uppercase tracking-wider flex items-center gap-2" 
        style={{ color: theme.textSecondary }}
      >
        <Icon name="shield" /> Personal Arms
      </h3>
      
      {/* Case 1: Person has personal arms */}
      {personalArms ? (
        <div className="space-y-2">
          {/* Arms Display */}
          <div 
            className="p-3 rounded border cursor-pointer hover:opacity-90 transition-all"
            style={{ backgroundColor: theme.bgLight, borderColor: theme.border }}
            onClick={handleViewArms}
          >
            <div className="flex items-center gap-3">
              {/* Shield Preview */}
              <div 
                className="w-16 h-20 flex-shrink-0 flex items-center justify-center rounded overflow-hidden"
                style={{ backgroundColor: theme.bgLighter }}
              >
                {personalArms.heraldrySVG ? (
                  <div
                    className="w-full h-full"
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                    dangerouslySetInnerHTML={{ __html: sanitizeSVG(personalArms.heraldrySVG) }}
                  />
                ) : personalArms.heraldryDisplay ? (
                  <img 
                    src={personalArms.heraldryDisplay} 
                    alt="Personal Arms"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-2xl"><Icon name="shield" size={24} /></span>
                )}
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate" style={{ color: theme.text }}>
                  {personalArms.name || 'Personal Arms'}
                </div>
                {personalArms.blazon && (
                  <div 
                    className="text-xs mt-1 line-clamp-2 italic"
                    style={{ color: theme.textSecondary }}
                  >
                    {personalArms.blazon}
                  </div>
                )}
                {birthOrderResult?.isEligible && (
                  <div 
                    className="text-xs mt-1 flex items-center gap-1"
                    style={{ color: theme.accent }}
                  >
                    <span>▼</span>
                    <span>{getBirthOrderLabel(birthOrderResult.position)}</span>
                  </div>
                )}
              </div>
              
              <span className="text-xs opacity-60">→</span>
            </div>
          </div>
          
          {/* Edit Button */}
          <button
            onClick={handleViewArms}
            className="w-full py-2 px-3 rounded border text-sm font-medium transition-all hover:opacity-80 flex items-center justify-center gap-2"
            style={{
              backgroundColor: 'transparent',
              color: theme.accent,
              borderColor: theme.accent
            }}
          >
            <Icon name="pencil" />
            <span>Edit Personal Arms</span>
          </button>
        </div>
      ) : (
        /* Case 2: No personal arms yet */
        <div className="space-y-3">
          
          {/* Eligibility Status */}
          {eligible && birthOrderResult ? (
            <>
              {/* Eligible - Show cadency info */}
              <div 
                className="p-3 rounded border"
                style={{ 
                  backgroundColor: `${theme.success}15`,
                  borderColor: theme.success
                }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg"><Icon name="check" /></span>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: theme.success }}>
                      Eligible for Personal Arms
                    </div>
                    <div className="text-xs mt-1" style={{ color: theme.text }}>
                      {cadencySummary?.description || `${getBirthOrderLabel(birthOrderResult.position)} among ${birthOrderResult.totalLegitimateSons} legitimate sons`}
                    </div>
                    <div className="text-xs mt-1 flex items-center gap-1" style={{ color: theme.textSecondary }}>
                      <span>Cadency:</span>
                      <span style={{ color: theme.accent }}>
                        {birthOrderResult.position} triangle{birthOrderResult.position !== 1 ? 's' : ''} in chief
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Preview (if house has heraldry) */}
              {previewSVG && (
                <div 
                  className="p-3 rounded border"
                  style={{ backgroundColor: theme.bgLight, borderColor: theme.border }}
                >
                  <div className="text-xs mb-2 text-center" style={{ color: theme.textSecondary }}>
                    Preview with Cadency
                  </div>
                  <div
                    className="w-24 h-28 mx-auto rounded overflow-hidden"
                    style={{ backgroundColor: theme.bgLighter }}
                  >
                    <div
                      className="w-full h-full"
                      dangerouslySetInnerHTML={{ __html: sanitizeSVG(previewSVG) }}
                    />
                  </div>
                  <div className="text-xs mt-2 text-center italic" style={{ color: theme.textSecondary }}>
                    House arms with {birthOrderResult.position} cadency mark{birthOrderResult.position !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
              
              {/* Create Button */}
              {houseHeraldry ? (
                <button
                  onClick={handleCreateArms}
                  className="w-full py-2 px-3 rounded border text-sm font-medium transition-all hover:opacity-80 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: theme.accent,
                    color: isDarkTheme ? '#1a1410' : '#ffffff',
                    borderColor: theme.accent
                  }}
                >
                  <Icon name="shield" />
                  <span>Create Personal Arms</span>
                </button>
              ) : (
                <div 
                  className="p-3 rounded border text-center text-sm"
                  style={{ 
                    backgroundColor: theme.bgLight, 
                    borderColor: theme.border, 
                    color: theme.textSecondary,
                    borderStyle: 'dashed'
                  }}
                >
                  <div>House has no heraldry to derive from</div>
                  {house && (
                    <button
                      onClick={() => navigate(`/heraldry/create?houseId=${house.id}`)}
                      className="mt-2 text-xs underline"
                      style={{ color: theme.accent }}
                    >
                      Create house heraldry first
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Not eligible for cadency */
            <div 
              className="p-3 rounded border"
              style={{ 
                backgroundColor: theme.bgLight, 
                borderColor: theme.border 
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg opacity-50"><Icon name="shield" /></span>
                <div className="flex-1">
                  <div className="text-sm" style={{ color: theme.textSecondary }}>
                    No Personal Arms
                  </div>
                  <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    {!eligible ? (
                      person?.gender === 'female' 
                        ? 'Cadency marks traditionally apply to male heirs'
                        : person?.legitimacyStatus === 'bastard'
                          ? 'Bastards may not bear family arms with cadency'
                          : 'Personal arms require legitimate status'
                    ) : (
                      'Birth order could not be determined'
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* House Arms Link (if exists) */}
          {house?.heraldryId && (
            <button
              onClick={handleViewHouseArms}
              className="w-full py-2 px-3 rounded border text-sm transition-all hover:opacity-80 flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'transparent',
                color: theme.textSecondary,
                borderColor: theme.border
              }}
            >
              <Icon name="castle" />
              <span>View House Arms</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default PersonalArmsSection;
