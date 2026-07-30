/**
 * DignityCrisisDashboard.jsx - Dignity Crisis Overview
 *
 * Displays all dignities experiencing succession issues:
 * - Interregnums (vacant with regents)
 * - Disputed successions
 * - Active disputes across all dignities
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDataset } from '../contexts/DatasetContext';
import {
  getDignitiesInInterregnum,
  getDignitiesInCrisis,
  getAllDisputes,
  getAllDignities,
  DIGNITY_CLASSES,
  CLAIM_TYPES,
  CLAIM_STRENGTHS,
  INTERREGNUM_REASONS,
  getDignityIcon,
  CLASS_ICONS
} from '../services/dignityService';
import { getAllPeople } from '../services/database';
import Navigation from '../components/Navigation';
import Icon from '../components/icons/Icon';
import LoadingState from '../components/shared/LoadingState';
import EmptyState from '../components/shared/EmptyState';
import ActionButton from '../components/shared/ActionButton';
import './DignityCrisisDashboard.css';
import { logger } from '../utils/logger';

// Animation variants
const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }
  }
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }
  }
};

// Class icons mapping
function DignityCrisisDashboard() {
  const navigate = useNavigate();
  const { activeDataset } = useDataset();

  const [loading, setLoading] = useState(true);
  const [interregnums, setInterregnums] = useState([]);
  const [crisisDignities, setCrisisDignities] = useState([]);
  const [allDisputes, setAllDisputes] = useState([]);
  const [vacantDignities, setVacantDignities] = useState([]);
  const [people, setPeople] = useState([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const datasetId = activeDataset?.id;

      const [
        interregnumData,
        crisisData,
        disputesData,
        allDignities,
        peopleData
      ] = await Promise.all([
        getDignitiesInInterregnum(datasetId),
        getDignitiesInCrisis(datasetId),
        getAllDisputes(datasetId),
        getAllDignities(datasetId),
        getAllPeople(datasetId)
      ]);

      setInterregnums(interregnumData);
      setCrisisDignities(crisisData);
      setAllDisputes(disputesData.filter(d => d.resolution === 'ongoing'));
      setVacantDignities(allDignities.filter(d => d.isVacant && !d.interregnum));
      setPeople(peopleData);
      setLoading(false);
    } catch (error) {
      logger.error('Error loading crisis data:', error);
      setLoading(false);
    }
  }, [activeDataset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getPersonName = useCallback((personId) => {
    if (!personId) return null;
    const person = people.find(p => p.id === personId);
    if (!person) return null;
    return `${person.firstName} ${person.lastName || ''}`.trim();
  }, [people]);

  const handleNavigateToDignity = (dignityId) => {
    navigate(`/dignities/view/${dignityId}`);
  };

  const totalCrises = interregnums.length + crisisDignities.length + vacantDignities.length;

  if (loading) {
    return (
      <div className="app-layout">
        <Navigation />
        <main className="crisis-dashboard">
          <LoadingState message="Loading crisis data..." />
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Navigation />
      <main className="crisis-dashboard">
        <motion.div
          className="crisis-dashboard__container"
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {/* Header */}
          <motion.header className="crisis-dashboard__header" variants={ITEM_VARIANTS}>
            <div className="crisis-dashboard__header-content">
              <div className="crisis-dashboard__breadcrumb">
                <button onClick={() => navigate('/dignities')}>
                  <Icon name="crown" size={14} />
                  <span>Dignities</span>
                </button>
                <Icon name="chevron-right" size={14} />
                <span>Crisis Dashboard</span>
              </div>
              <h1 className="crisis-dashboard__title">
                <Icon name="alert-triangle" size={28} />
                <span>Succession Crises</span>
              </h1>
              <p className="crisis-dashboard__subtitle">
                {totalCrises === 0
                  ? 'No succession issues detected across all dignities'
                  : `${totalCrises} dignit${totalCrises === 1 ? 'y' : 'ies'} requiring attention`}
              </p>
            </div>
            <ActionButton
              icon="arrow-left"
              onClick={() => navigate('/dignities')}
              variant="secondary"
            >
              Back to Dignities
            </ActionButton>
          </motion.header>

          {totalCrises === 0 ? (
            <motion.div variants={ITEM_VARIANTS}>
              <EmptyState
                icon="check-circle"
                title="All Successions Stable"
                description="There are no interregnums, disputes, or vacant dignities requiring attention."
              />
            </motion.div>
          ) : (
            <div className="crisis-dashboard__grid">
              {/* Interregnums Section */}
              <motion.section className="crisis-section" variants={CARD_VARIANTS}>
                <h2 className="crisis-section__title">
                  <Icon name="hourglass" size={20} />
                  <span>Interregnums</span>
                  <span className="crisis-section__count">{interregnums.length}</span>
                </h2>
                {interregnums.length === 0 ? (
                  <p className="crisis-section__empty">No dignities are currently in interregnum</p>
                ) : (
                  <div className="crisis-section__list">
                    {interregnums.map(dignity => (
                      <button
                        key={dignity.id}
                        className="crisis-card crisis-card--interregnum"
                        onClick={() => handleNavigateToDignity(dignity.id)}
                      >
                        <div className="crisis-card__icon">
                          <Icon name={CLASS_ICONS[dignity.dignityClass] || 'scroll-text'} size={20} />
                        </div>
                        <div className="crisis-card__content">
                          <span className="crisis-card__name">{dignity.name}</span>
                          {dignity.interregnum && (
                            <div className="crisis-card__details">
                              {dignity.interregnum.regentId && (
                                <span className="crisis-card__detail">
                                  <Icon name="user" size={12} />
                                  Regent: {getPersonName(dignity.interregnum.regentId) || 'Unknown'}
                                </span>
                              )}
                              {dignity.interregnum.reason && (
                                <span className="crisis-card__detail">
                                  <Icon name="info" size={12} />
                                  {INTERREGNUM_REASONS[dignity.interregnum.reason]?.name || dignity.interregnum.reason}
                                </span>
                              )}
                              {dignity.interregnum.startDate && (
                                <span className="crisis-card__detail">
                                  <Icon name="calendar" size={12} />
                                  Since {dignity.interregnum.startDate}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <Icon name="arrow-right" size={16} className="crisis-card__arrow" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.section>

              {/* Disputed Successions Section */}
              <motion.section className="crisis-section" variants={CARD_VARIANTS}>
                <h2 className="crisis-section__title">
                  <Icon name="swords" size={20} />
                  <span>Disputed Successions</span>
                  <span className="crisis-section__count">{crisisDignities.length}</span>
                </h2>
                {crisisDignities.length === 0 ? (
                  <p className="crisis-section__empty">No succession disputes active</p>
                ) : (
                  <div className="crisis-section__list">
                    {crisisDignities.map(dignity => {
                      const activeDisputes = (dignity.disputes || []).filter(d => d.resolution === 'ongoing');
                      return (
                        <button
                          key={dignity.id}
                          className="crisis-card crisis-card--disputed"
                          onClick={() => handleNavigateToDignity(dignity.id)}
                        >
                          <div className="crisis-card__icon">
                            <Icon name={CLASS_ICONS[dignity.dignityClass] || 'scroll-text'} size={20} />
                          </div>
                          <div className="crisis-card__content">
                            <span className="crisis-card__name">{dignity.name}</span>
                            <div className="crisis-card__details">
                              <span className="crisis-card__detail crisis-card__detail--disputes">
                                <Icon name="alert-circle" size={12} />
                                {activeDisputes.length} active claim{activeDisputes.length !== 1 ? 's' : ''}
                              </span>
                              {dignity.currentHolderId && (
                                <span className="crisis-card__detail">
                                  <Icon name="user" size={12} />
                                  Holder: {getPersonName(dignity.currentHolderId) || 'Unknown'}
                                </span>
                              )}
                            </div>
                          </div>
                          <Icon name="arrow-right" size={16} className="crisis-card__arrow" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.section>

              {/* Vacant Dignities Section */}
              <motion.section className="crisis-section" variants={CARD_VARIANTS}>
                <h2 className="crisis-section__title">
                  <Icon name="circle-off" size={20} />
                  <span>Vacant Dignities</span>
                  <span className="crisis-section__count">{vacantDignities.length}</span>
                </h2>
                {vacantDignities.length === 0 ? (
                  <p className="crisis-section__empty">No vacant dignities without regents</p>
                ) : (
                  <div className="crisis-section__list">
                    {vacantDignities.map(dignity => (
                      <button
                        key={dignity.id}
                        className="crisis-card crisis-card--vacant"
                        onClick={() => handleNavigateToDignity(dignity.id)}
                      >
                        <div className="crisis-card__icon">
                          <Icon name={CLASS_ICONS[dignity.dignityClass] || 'scroll-text'} size={20} />
                        </div>
                        <div className="crisis-card__content">
                          <span className="crisis-card__name">{dignity.name}</span>
                          <div className="crisis-card__details">
                            <span className="crisis-card__detail crisis-card__detail--vacant">
                              <Icon name="alert-triangle" size={12} />
                              No holder assigned
                            </span>
                            {dignity.placeName && (
                              <span className="crisis-card__detail">
                                <Icon name="map-pin" size={12} />
                                {dignity.placeName}
                              </span>
                            )}
                          </div>
                        </div>
                        <Icon name="arrow-right" size={16} className="crisis-card__arrow" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.section>

              {/* All Active Disputes Section */}
              <motion.section className="crisis-section crisis-section--full" variants={CARD_VARIANTS}>
                <h2 className="crisis-section__title">
                  <Icon name="gavel" size={20} />
                  <span>All Active Disputes</span>
                  <span className="crisis-section__count">{allDisputes.length}</span>
                </h2>
                {allDisputes.length === 0 ? (
                  <p className="crisis-section__empty">No active disputes across any dignities</p>
                ) : (
                  <div className="crisis-section__table">
                    <div className="crisis-table__header">
                      <span>Dignity</span>
                      <span>Claimant</span>
                      <span>Claim Type</span>
                      <span>Strength</span>
                      <span></span>
                    </div>
                    {allDisputes.map((dispute, index) => (
                      <button
                        key={`${dispute.dignityId}-${index}`}
                        className="crisis-table__row"
                        onClick={() => handleNavigateToDignity(dispute.dignityId)}
                      >
                        <span className="crisis-table__dignity">
                          <Icon name={CLASS_ICONS[dispute.dignityClass] || 'scroll-text'} size={14} />
                          {dispute.dignityName}
                        </span>
                        <span className="crisis-table__claimant">
                          {getPersonName(dispute.claimantId) || 'Unknown Claimant'}
                        </span>
                        <span className="crisis-table__type">
                          {CLAIM_TYPES[dispute.claimType]?.name || dispute.claimType}
                        </span>
                        <span className={`crisis-table__strength crisis-table__strength--${dispute.claimStrength}`}>
                          {CLAIM_STRENGTHS[dispute.claimStrength]?.name || dispute.claimStrength}
                        </span>
                        <span className="crisis-table__arrow">
                          <Icon name="arrow-right" size={14} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.section>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

export default DignityCrisisDashboard;
