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
import './PersonalArmsSection.css';

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
  // isDarkTheme kept for API compatibility; colour now comes from CSS custom
  // properties, so this renders correctly in all seven themes.
  isDarkTheme: _isDarkTheme = true,
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
        <h3 className="personal-arms__title">
          <Icon name="shield" /> Personal Arms
        </h3>
        <div className="personal-arms__loading">
          Loading...
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className="personal-arms__title">
        <Icon name="shield" /> Personal Arms
      </h3>
      
      {/* Case 1: Person has personal arms */}
      {personalArms ? (
        <div className="personal-arms__stack">
          {/* Arms Display */}
          <div className="personal-arms__card" onClick={handleViewArms}>
            <div className="personal-arms__card-row">
              {/* Shield Preview */}
              <div className="personal-arms__shield">
                {personalArms.heraldrySVG ? (
                  <div
                    className="personal-arms__shield-svg"
                    dangerouslySetInnerHTML={{ __html: sanitizeSVG(personalArms.heraldrySVG) }}
                  />
                ) : personalArms.heraldryDisplay ? (
                  <img 
                    src={personalArms.heraldryDisplay} 
                    alt="Personal Arms"
                    className="personal-arms__shield-img"
                  />
                ) : (
                  <Icon name="shield" size={24} />
                )}
              </div>
              
              {/* Info */}
              <div className="personal-arms__info">
                <div className="personal-arms__name">
                  {personalArms.name || 'Personal Arms'}
                </div>
                {personalArms.blazon && (
                  <div className="personal-arms__blazon">
                    {personalArms.blazon}
                  </div>
                )}
                {birthOrderResult?.isEligible && (
                  <div className="personal-arms__cadency-note"><Icon name="chevron-down" size={12} />
                    <span>{getBirthOrderLabel(birthOrderResult.position)}</span>
                  </div>
                )}
              </div>
              
              <span className="personal-arms__chevron" aria-hidden="true">→</span>
            </div>
          </div>
          
          {/* Edit Button */}
          <button
            onClick={handleViewArms}
            className="personal-arms__btn personal-arms__btn--edit"
            type="button"
          >
            <Icon name="pencil" />
            <span>Edit Personal Arms</span>
          </button>
        </div>
      ) : (
        /* Case 2: No personal arms yet */
        <div className="personal-arms__stack personal-arms__stack--wide">
          
          {/* Eligibility Status */}
          {eligible && birthOrderResult ? (
            <>
              {/* Eligible - Show cadency info */}
              <div className="personal-arms__panel personal-arms__panel--eligible">
                <div className="personal-arms__panel-row">
                  <Icon name="check" className="personal-arms__panel-icon" />
                  <div className="personal-arms__panel-body">
                    <div className="personal-arms__panel-title">
                      Eligible for Personal Arms
                    </div>
                    <div className="personal-arms__panel-note">
                      {cadencySummary?.description || `${getBirthOrderLabel(birthOrderResult.position)} among ${birthOrderResult.totalLegitimateSons} legitimate sons`}
                    </div>
                    <div className="personal-arms__panel-meta">
                      <span>Cadency:</span>
                      <span className="personal-arms__panel-meta-value">
                        {birthOrderResult.position} triangle{birthOrderResult.position !== 1 ? 's' : ''} in chief
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Preview (if house has heraldry) */}
              {previewSVG && (
                <div className="personal-arms__panel"><div className="personal-arms__preview-label">
                    Preview with Cadency
                  </div>
                  <div className="personal-arms__shield personal-arms__shield--preview">
                    <div
                      className="personal-arms__shield-svg"
                      dangerouslySetInnerHTML={{ __html: sanitizeSVG(previewSVG) }}
                    />
                  </div>
                  <div className="personal-arms__preview-caption">
                    House arms with {birthOrderResult.position} cadency mark{birthOrderResult.position !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
              
              {/* Create Button */}
              {houseHeraldry ? (
                <button
                  onClick={handleCreateArms}
                  className="personal-arms__btn personal-arms__btn--create"
                  type="button"
                >
                  <Icon name="shield" />
                  <span>Create Personal Arms</span>
                </button>
              ) : (
                <div className="personal-arms__panel personal-arms__panel--muted">
                  <div>House has no heraldry to derive from</div>
                  {house && (
                    <button
                      onClick={() => navigate(`/heraldry/create?houseId=${house.id}`)}
                      className="personal-arms__link"
                      type="button"
                    >
                      Create house heraldry first
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Not eligible for cadency */
            <div className="personal-arms__panel">
              <div className="personal-arms__panel-row">
                <Icon name="shield" className="personal-arms__panel-icon personal-arms__panel-icon--muted" />
                <div className="personal-arms__panel-body">
                  <div className="personal-arms__panel-title personal-arms__panel-title--muted">
                    No Personal Arms
                  </div>
                  <div className="personal-arms__panel-note personal-arms__panel-note--secondary">
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
              className="personal-arms__btn personal-arms__btn--house"
              type="button"
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
