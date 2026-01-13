import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import {
  getDignity,
  deleteDignity,
  getTenuresForDignity,
  getSubordinateDignities,
  getFeudalChain,
  createDignityTenure,
  updateDignityTenure,
  deleteDignityTenure,
  updateDignity,
  calculateSuccessionLine,
  addDispute,
  resolveDispute,
  removeDispute,
  setInterregnum,
  endInterregnum,
  DIGNITY_CLASSES,
  DIGNITY_RANKS,
  TENURE_TYPES,
  FEALTY_TYPES,
  ACQUISITION_TYPES,
  END_TYPES,
  SUCCESSION_TYPES,
  SUCCESSION_STATUS,
  CLAIM_TYPES,
  CLAIM_STRENGTHS,
  DISPUTE_RESOLUTIONS,
  INTERREGNUM_REASONS
} from '../services/dignityService';
import { getAllHouses, getAllPeople, getAllRelationships } from '../services/database';
import Navigation from '../components/Navigation';
import Icon from '../components/icons/Icon';
import LoadingState from '../components/shared/LoadingState';
import EmptyState from '../components/shared/EmptyState';
import ActionButton from '../components/shared/ActionButton';
import { SuggestionCard } from '../components/suggestions';
import { useDignityAnalysis } from '../hooks';
import './DignityView.css';

/**
 * DignityView - Comprehensive Dignity Detail Page
 *
 * Displays a single dignity with:
 * - Classification and rank
 * - Current holder and house
 * - Feudal hierarchy (sworn to / subordinates)
 * - Tenure history
 * - Succession line and disputes
 * - Interregnum management
 */

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
const CLASS_ICONS = {
  crown: 'crown',
  driht: 'castle',
  ward: 'shield-check',
  sir: 'sword',
  other: 'scroll-text'
};

function DignityView() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();

  // State
  const [dignity, setDignity] = useState(null);
  const [tenures, setTenures] = useState([]);
  const [subordinates, setSubordinates] = useState([]);
  const [feudalChain, setFeudalChain] = useState([]);
  const [houses, setHouses] = useState([]);
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Succession state
  const [successionLine, setSuccessionLine] = useState([]);
  const [loadingSuccession, setLoadingSuccession] = useState(false);
  const [showSuccessionRulesModal, setShowSuccessionRulesModal] = useState(false);
  const [successionRulesForm, setSuccessionRulesForm] = useState({
    successionType: 'male-primogeniture',
    excludeBastards: true,
    legitimizedBastardsEligible: true,
    excludeWomen: false,
    requiresConfirmation: false,
    customNotes: '',
    designatedHeirId: ''
  });
  const [savingRules, setSavingRules] = useState(false);

  // Dispute state
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeMode, setDisputeMode] = useState('add');
  const [editingDispute, setEditingDispute] = useState(null);
  const [disputeForm, setDisputeForm] = useState({
    claimantId: '',
    claimType: 'hereditary',
    claimStrength: 'moderate',
    claimBasis: '',
    supportingFactions: '',
    startDate: '',
    notes: '',
    resolution: '',
    resolvedDate: ''
  });
  const [savingDispute, setSavingDispute] = useState(false);

  // Interregnum state
  const [showInterregnumModal, setShowInterregnumModal] = useState(false);
  const [interregnumForm, setInterregnumForm] = useState({
    startDate: '',
    regentId: '',
    regentTitle: 'Regent',
    reason: 'vacancy',
    notes: ''
  });
  const [savingInterregnum, setSavingInterregnum] = useState(false);

  // Tenure form state
  const [showTenureModal, setShowTenureModal] = useState(false);
  const [tenureMode, setTenureMode] = useState('add');
  const [editingTenure, setEditingTenure] = useState(null);
  const [tenureForm, setTenureForm] = useState({
    personId: '',
    dateStarted: '',
    dateEnded: '',
    acquisitionType: 'inheritance',
    endType: '',
    notes: ''
  });
  const [savingTenure, setSavingTenure] = useState(false);

  // Entity-specific dignity analysis
  const {
    suggestions: entitySuggestions,
    loading: analysisLoading,
    applySuggestion,
    dismissSuggestion
  } = useDignityAnalysis({
    scope: 'dignity',
    entityId: id,
    autoRun: true
  });

  // Helper functions
  const getHouseName = useCallback((houseId) => {
    if (!houseId) return null;
    const house = houses.find(h => h.id === houseId);
    return house?.houseName || null;
  }, [houses]);

  const getHouseColor = useCallback((houseId) => {
    if (!houseId) return '#666';
    const house = houses.find(h => h.id === houseId);
    return house?.colorCode || '#666';
  }, [houses]);

  const getPersonName = useCallback((personId) => {
    if (!personId) return null;
    const person = people.find(p => p.id === personId);
    if (!person) return null;
    return `${person.firstName} ${person.lastName}`;
  }, [people]);

  const getClassInfo = useCallback((dignityClass) => {
    return DIGNITY_CLASSES[dignityClass] || DIGNITY_CLASSES.other;
  }, []);

  const getRankInfo = useCallback((dignityClass, dignityRank) => {
    const classRanks = DIGNITY_RANKS[dignityClass];
    if (!classRanks) return null;
    return classRanks[dignityRank] || null;
  }, []);

  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return 'Unknown';
    if (dateStr.length === 4) return dateStr;
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, []);

  const formatTimestamp = useCallback((isoString) => {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, []);

  // Calculate succession line
  const calculateSuccession = useCallback(async (dignityData, peopleData, relationshipsData) => {
    try {
      setLoadingSuccession(true);

      const parentMap = new Map();
      const childrenMap = new Map();
      const spouseMap = new Map();

      for (const rel of relationshipsData) {
        if (rel.relationshipType === 'parent') {
          const existingParents = parentMap.get(rel.person2Id) || [];
          parentMap.set(rel.person2Id, [...existingParents, rel.person1Id]);
          const existingChildren = childrenMap.get(rel.person1Id) || [];
          childrenMap.set(rel.person1Id, [...existingChildren, rel.person2Id]);
        } else if (rel.relationshipType === 'spouse') {
          spouseMap.set(rel.person1Id, rel.person2Id);
          spouseMap.set(rel.person2Id, rel.person1Id);
        }
      }

      const line = await calculateSuccessionLine(
        dignityData.id,
        peopleData,
        parentMap,
        childrenMap,
        spouseMap,
        10
      );

      setSuccessionLine(line);
    } catch (err) {
      console.error('Error calculating succession:', err);
      setSuccessionLine([]);
    } finally {
      setLoadingSuccession(false);
    }
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const dignityId = parseInt(id);

      const [
        dignityData,
        tenuresData,
        subordinatesData,
        chainData,
        housesData,
        peopleData,
        relationshipsData
      ] = await Promise.all([
        getDignity(dignityId),
        getTenuresForDignity(dignityId),
        getSubordinateDignities(dignityId),
        getFeudalChain(dignityId),
        getAllHouses(),
        getAllPeople(),
        getAllRelationships()
      ]);

      if (!dignityData) {
        setError('Dignity not found');
        setLoading(false);
        return;
      }

      setDignity(dignityData);
      setTenures(tenuresData);
      setSubordinates(subordinatesData);
      setFeudalChain(chainData);
      setHouses(housesData);
      setPeople(peopleData);
      setRelationships(relationshipsData);
      setLoading(false);

      if (dignityData.currentHolderId) {
        calculateSuccession(dignityData, peopleData, relationshipsData);
      }
    } catch (err) {
      console.error('Error loading dignity:', err);
      setError('Failed to load dignity');
      setLoading(false);
    }
  }, [id, calculateSuccession]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Navigation handlers
  const handleEdit = useCallback(() => {
    navigate(`/dignities/edit/${id}`);
  }, [navigate, id]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Delete "${dignity.name}"?\n\nThis will remove the dignity and all associated tenure records. This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDignity(parseInt(id), user?.uid);
      navigate('/dignities');
    } catch (err) {
      console.error('Error deleting dignity:', err);
      alert('Failed to delete dignity');
    }
  }, [dignity?.name, id, navigate, user?.uid]);

  const handleNavigateToDignity = useCallback((dignityId) => {
    navigate(`/dignities/view/${dignityId}`);
  }, [navigate]);

  const handleBackToRolls = useCallback(() => {
    navigate('/dignities');
  }, [navigate]);

  // Tenure management handlers
  const handleOpenAddTenure = useCallback(() => {
    setTenureMode('add');
    setEditingTenure(null);
    setTenureForm({
      personId: dignity?.currentHolderId || '',
      dateStarted: '',
      dateEnded: '',
      acquisitionType: 'inheritance',
      endType: '',
      notes: ''
    });
    setShowTenureModal(true);
  }, [dignity?.currentHolderId]);

  const handleOpenEndTenure = useCallback((tenure) => {
    setTenureMode('end');
    setEditingTenure(tenure);
    setTenureForm({
      personId: tenure.personId,
      dateStarted: tenure.dateStarted || '',
      dateEnded: '',
      acquisitionType: tenure.acquisitionType || 'inheritance',
      endType: 'death',
      notes: tenure.notes || ''
    });
    setShowTenureModal(true);
  }, []);

  const handleCloseTenureModal = useCallback(() => {
    setShowTenureModal(false);
    setEditingTenure(null);
    setTenureForm({
      personId: '',
      dateStarted: '',
      dateEnded: '',
      acquisitionType: 'inheritance',
      endType: '',
      notes: ''
    });
  }, []);

  const handleSaveTenure = useCallback(async () => {
    if (tenureMode === 'add' && !tenureForm.personId) {
      alert('Please select who held this dignity');
      return;
    }

    try {
      setSavingTenure(true);

      if (tenureMode === 'end' && editingTenure) {
        await updateDignityTenure(editingTenure.id, {
          dateEnded: tenureForm.dateEnded || null,
          endType: tenureForm.endType || null,
          notes: tenureForm.notes || null
        }, user?.uid);

        if (!editingTenure.dateEnded) {
          await updateDignity(parseInt(id), {
            currentHolderId: null,
            isVacant: true
          }, user?.uid);
        }
      } else {
        await createDignityTenure({
          dignityId: parseInt(id),
          personId: parseInt(tenureForm.personId),
          dateStarted: tenureForm.dateStarted || null,
          dateEnded: tenureForm.dateEnded || null,
          acquisitionType: tenureForm.acquisitionType,
          endType: tenureForm.dateEnded ? tenureForm.endType : null,
          notes: tenureForm.notes || null
        }, user?.uid);

        if (!tenureForm.dateEnded) {
          const selectedPerson = people.find(p => p.id === parseInt(tenureForm.personId));
          await updateDignity(parseInt(id), {
            currentHolderId: parseInt(tenureForm.personId),
            currentHouseId: selectedPerson?.houseId || dignity.currentHouseId,
            isVacant: false
          }, user?.uid);
        }
      }

      await loadData();
      handleCloseTenureModal();
    } catch (err) {
      console.error('Error saving tenure:', err);
      alert('Failed to save tenure record');
    } finally {
      setSavingTenure(false);
    }
  }, [tenureMode, tenureForm, editingTenure, id, user?.uid, people, dignity?.currentHouseId, loadData, handleCloseTenureModal]);

  const handleDeleteTenure = useCallback(async (tenureId) => {
    if (!window.confirm('Delete this tenure record? This cannot be undone.')) {
      return;
    }

    try {
      await deleteDignityTenure(tenureId, user?.uid);
      await loadData();
    } catch (err) {
      console.error('Error deleting tenure:', err);
      alert('Failed to delete tenure record');
    }
  }, [user?.uid, loadData]);

  // Succession management handlers
  const handleOpenSuccessionRules = useCallback(() => {
    const rules = dignity?.successionRules || {};
    setSuccessionRulesForm({
      successionType: dignity?.successionType || 'male-primogeniture',
      excludeBastards: rules.excludeBastards !== false,
      legitimizedBastardsEligible: rules.legitimizedBastardsEligible !== false,
      excludeWomen: rules.excludeWomen || false,
      requiresConfirmation: rules.requiresConfirmation || false,
      customNotes: rules.customNotes || '',
      designatedHeirId: dignity?.designatedHeirId || ''
    });
    setShowSuccessionRulesModal(true);
  }, [dignity]);

  const handleCloseSuccessionRulesModal = useCallback(() => {
    setShowSuccessionRulesModal(false);
  }, []);

  const handleSaveSuccessionRules = useCallback(async () => {
    try {
      setSavingRules(true);

      await updateDignity(parseInt(id), {
        successionType: successionRulesForm.successionType,
        successionRules: {
          excludeBastards: successionRulesForm.excludeBastards,
          legitimizedBastardsEligible: successionRulesForm.legitimizedBastardsEligible,
          excludeWomen: successionRulesForm.excludeWomen,
          requiresConfirmation: successionRulesForm.requiresConfirmation,
          customNotes: successionRulesForm.customNotes || null
        },
        designatedHeirId: successionRulesForm.designatedHeirId
          ? parseInt(successionRulesForm.designatedHeirId)
          : null
      }, user?.uid);

      await loadData();
      handleCloseSuccessionRulesModal();
    } catch (err) {
      console.error('Error saving succession rules:', err);
      alert('Failed to save succession rules');
    } finally {
      setSavingRules(false);
    }
  }, [successionRulesForm, id, user?.uid, loadData, handleCloseSuccessionRulesModal]);

  // Dispute management handlers
  const handleOpenAddDispute = useCallback(() => {
    setDisputeMode('add');
    setEditingDispute(null);
    setDisputeForm({
      claimantId: '',
      claimType: 'hereditary',
      claimStrength: 'moderate',
      claimBasis: '',
      supportingFactions: '',
      startDate: '',
      notes: '',
      resolution: '',
      resolvedDate: ''
    });
    setShowDisputeModal(true);
  }, []);

  const handleOpenResolveDispute = useCallback((dispute) => {
    setDisputeMode('resolve');
    setEditingDispute(dispute);
    setDisputeForm(prev => ({
      ...prev,
      claimantId: dispute.claimantId,
      resolution: '',
      resolvedDate: ''
    }));
    setShowDisputeModal(true);
  }, []);

  const handleCloseDisputeModal = useCallback(() => {
    setShowDisputeModal(false);
    setEditingDispute(null);
  }, []);

  const handleSaveDispute = useCallback(async () => {
    if (disputeMode === 'add' && !disputeForm.claimantId) {
      alert('Please select a claimant');
      return;
    }

    try {
      setSavingDispute(true);

      if (disputeMode === 'resolve' && editingDispute) {
        await resolveDispute(
          parseInt(id),
          editingDispute.id,
          disputeForm.resolution,
          disputeForm.resolvedDate || null,
          user?.uid
        );
      } else {
        await addDispute(parseInt(id), {
          claimantId: parseInt(disputeForm.claimantId),
          claimType: disputeForm.claimType,
          claimStrength: disputeForm.claimStrength,
          claimBasis: disputeForm.claimBasis,
          supportingFactions: disputeForm.supportingFactions
            ? disputeForm.supportingFactions.split(',').map(s => s.trim())
            : [],
          startDate: disputeForm.startDate || null,
          notes: disputeForm.notes || null
        }, user?.uid);
      }

      await loadData();
      handleCloseDisputeModal();
    } catch (err) {
      console.error('Error saving dispute:', err);
      alert('Failed to save dispute');
    } finally {
      setSavingDispute(false);
    }
  }, [disputeMode, disputeForm, editingDispute, id, user?.uid, loadData, handleCloseDisputeModal]);

  const handleRemoveDispute = useCallback(async (disputeId) => {
    if (!window.confirm('Remove this disputed claim? This cannot be undone.')) {
      return;
    }

    try {
      await removeDispute(parseInt(id), disputeId, user?.uid);
      await loadData();
    } catch (err) {
      console.error('Error removing dispute:', err);
      alert('Failed to remove dispute');
    }
  }, [id, user?.uid, loadData]);

  // Interregnum management handlers
  const handleOpenInterregnum = useCallback(() => {
    const existing = dignity?.interregnum || {};
    setInterregnumForm({
      startDate: existing.startDate || '',
      regentId: existing.regentId || '',
      regentTitle: existing.regentTitle || 'Regent',
      reason: existing.reason || 'vacancy',
      notes: existing.notes || ''
    });
    setShowInterregnumModal(true);
  }, [dignity?.interregnum]);

  const handleCloseInterregnumModal = useCallback(() => {
    setShowInterregnumModal(false);
  }, []);

  const handleSaveInterregnum = useCallback(async () => {
    try {
      setSavingInterregnum(true);

      await setInterregnum(parseInt(id), {
        startDate: interregnumForm.startDate || null,
        regentId: interregnumForm.regentId
          ? parseInt(interregnumForm.regentId)
          : null,
        regentTitle: interregnumForm.regentTitle || 'Regent',
        reason: interregnumForm.reason,
        notes: interregnumForm.notes || null
      }, user?.uid);

      await loadData();
      handleCloseInterregnumModal();
    } catch (err) {
      console.error('Error setting interregnum:', err);
      alert('Failed to set interregnum');
    } finally {
      setSavingInterregnum(false);
    }
  }, [interregnumForm, id, user?.uid, loadData, handleCloseInterregnumModal]);

  const handleEndInterregnum = useCallback(async () => {
    const heir = successionLine.find(c => !c.excluded);
    if (!heir) {
      alert('No eligible heir found. Please add a tenure record manually.');
      return;
    }

    if (!window.confirm(`End interregnum and install ${getPersonName(heir.personId)} as the new holder?`)) {
      return;
    }

    try {
      await endInterregnum(parseInt(id), heir.personId, user?.uid);
      await loadData();
    } catch (err) {
      console.error('Error ending interregnum:', err);
      alert('Failed to end interregnum');
    }
  }, [successionLine, getPersonName, id, user?.uid, loadData]);

  // Derived values
  const classInfo = useMemo(() => dignity ? getClassInfo(dignity.dignityClass) : null, [dignity, getClassInfo]);
  const rankInfo = useMemo(() => dignity ? getRankInfo(dignity.dignityClass, dignity.dignityRank) : null, [dignity, getRankInfo]);
  const holderName = useMemo(() => dignity ? getPersonName(dignity.currentHolderId) : null, [dignity, getPersonName]);
  const houseName = useMemo(() => dignity ? getHouseName(dignity.currentHouseId) : null, [dignity, getHouseName]);
  const houseColor = useMemo(() => dignity ? getHouseColor(dignity.currentHouseId) : '#666', [dignity, getHouseColor]);
  const swornToDignity = useMemo(() => feudalChain.length > 1 ? feudalChain[1] : null, [feudalChain]);
  const classIcon = useMemo(() => dignity ? (CLASS_ICONS[dignity.dignityClass] || 'scroll-text') : 'scroll-text', [dignity]);

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="dignity-view-page">
          <div className="dignity-view-container">
            <LoadingState message="Loading dignity..." icon="scroll-text" />
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error || !dignity) {
    return (
      <>
        <Navigation />
        <div className="dignity-view-page">
          <div className="dignity-view-container">
            <EmptyState
              icon="alert-triangle"
              title="Error"
              description={error || 'Dignity not found'}
              action={{
                label: 'Back to Rolls',
                onClick: handleBackToRolls,
                icon: 'arrow-left'
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />

      <div className="dignity-view-page">
        <motion.div
          className="dignity-view-container"
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {/* Header */}
          <motion.header className="dignity-view-header" variants={ITEM_VARIANTS}>
            <button className="dignity-view-header__back" onClick={handleBackToRolls}>
              <Icon name="arrow-left" size={16} />
              <span>Back to Rolls</span>
            </button>

            <div className="dignity-view-header__content">
              <div className={`dignity-view-header__badge dignity-view-header__badge--${dignity.dignityClass}`}>
                <Icon name={classIcon} size={16} />
                <span>{classInfo?.name}</span>
              </div>

              <h1 className="dignity-view-header__title">
                <Icon name={classIcon} size={32} className="dignity-view-header__title-icon" />
                <span className="dignity-view-header__initial">{dignity.name.charAt(0)}</span>
                {dignity.name.slice(1)}
              </h1>

              {rankInfo && (
                <p className="dignity-view-header__rank">{rankInfo.name} — {rankInfo.description}</p>
              )}

              {dignity.isVacant && (
                <span className="dignity-view-header__vacant">
                  <Icon name="alert-triangle" size={14} />
                  <span>Currently Vacant</span>
                </span>
              )}
            </div>

            <div className="dignity-view-header__actions">
              <ActionButton icon="edit-3" onClick={handleEdit} variant="primary" size="sm">
                Edit
              </ActionButton>
              <ActionButton icon="trash-2" onClick={handleDelete} variant="danger" size="sm">
                Delete
              </ActionButton>
            </div>
          </motion.header>

          {/* Main Content */}
          <div className="dignity-view-content">
            {/* Left Column */}
            <div className="dignity-view-main">
              {/* Current Holder Section */}
              <motion.section className="dignity-section" variants={CARD_VARIANTS}>
                <h2 className="dignity-section__title">
                  <Icon name="user" size={18} />
                  <span>Current Holder</span>
                </h2>

                {holderName ? (
                  <div className="dignity-holder">
                    <div
                      className="dignity-holder__indicator"
                      style={{ backgroundColor: houseColor }}
                    />
                    <div className="dignity-holder__info">
                      <span className="dignity-holder__name">{holderName}</span>
                      {houseName && (
                        <span className="dignity-holder__house">of {houseName}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="dignity-holder--vacant">
                    <Icon name="circle-off" size={18} />
                    <span>{dignity.isVacant ? 'This dignity is currently vacant' : 'No holder assigned'}</span>
                  </div>
                )}

                {houseName && dignity.isHereditary && (
                  <div className="dignity-hereditary-note">
                    <Icon name="home" size={14} />
                    <span>Held hereditarily by <strong>{houseName}</strong></span>
                  </div>
                )}
              </motion.section>

              {/* Feudal Hierarchy Section */}
              <motion.section className="dignity-section" variants={CARD_VARIANTS}>
                <h2 className="dignity-section__title">
                  <Icon name="swords" size={18} />
                  <span>Feudal Hierarchy</span>
                </h2>

                {/* Sworn To */}
                {swornToDignity ? (
                  <div className="dignity-hierarchy__item">
                    <span className="dignity-hierarchy__label">Sworn To:</span>
                    <button
                      className="dignity-hierarchy__link"
                      onClick={() => handleNavigateToDignity(swornToDignity.id)}
                    >
                      <Icon name={CLASS_ICONS[swornToDignity.dignityClass] || 'scroll-text'} size={16} />
                      <span>{swornToDignity.name}</span>
                      <Icon name="arrow-right" size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="dignity-hierarchy__item">
                    <span className="dignity-hierarchy__label">Sworn To:</span>
                    <span className="dignity-hierarchy__apex">
                      <Icon name="crown" size={16} />
                      <span>The Crown of Estargenn (Apex)</span>
                    </span>
                  </div>
                )}

                {/* Full Chain */}
                {feudalChain.length > 2 && (
                  <div className="dignity-chain">
                    <h4 className="dignity-chain__title">Chain of Fealty:</h4>
                    <div className="dignity-chain__list">
                      {feudalChain.map((d, index) => (
                        <div key={d.id} className="dignity-chain__item">
                          {index > 0 && <Icon name="arrow-up" size={12} className="dignity-chain__arrow" />}
                          <button
                            className={`dignity-chain__name ${d.id === parseInt(id) ? 'dignity-chain__name--current' : ''}`}
                            onClick={() => d.id !== parseInt(id) && handleNavigateToDignity(d.id)}
                            disabled={d.id === parseInt(id)}
                          >
                            <Icon name={CLASS_ICONS[d.dignityClass] || 'scroll-text'} size={14} />
                            <span>{d.name}</span>
                          </button>
                        </div>
                      ))}
                      <div className="dignity-chain__item">
                        <Icon name="arrow-up" size={12} className="dignity-chain__arrow" />
                        <span className="dignity-chain__name dignity-chain__name--crown">
                          <Icon name="crown" size={14} />
                          <span>Crown of Estargenn</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Subordinates */}
                {subordinates.length > 0 && (
                  <div className="dignity-subordinates">
                    <h4 className="dignity-subordinates__title">
                      Sworn Subordinates ({subordinates.length}):
                    </h4>
                    <div className="dignity-subordinates__list">
                      {subordinates.map(sub => (
                        <button
                          key={sub.id}
                          className="dignity-subordinates__item"
                          onClick={() => handleNavigateToDignity(sub.id)}
                        >
                          <Icon name={CLASS_ICONS[sub.dignityClass] || 'scroll-text'} size={16} />
                          <span className="dignity-subordinates__name">{sub.name}</span>
                          {sub.currentHolderId && (
                            <span className="dignity-subordinates__holder">
                              ({getPersonName(sub.currentHolderId)})
                            </span>
                          )}
                          <Icon name="arrow-right" size={14} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.section>

              {/* Succession Section */}
              <motion.section className="dignity-section dignity-section--succession" variants={CARD_VARIANTS}>
                <h2 className="dignity-section__title">
                  <Icon name="crown" size={18} />
                  <span>Succession</span>
                  {dignity.successionStatus && dignity.successionStatus !== 'stable' && (
                    <span className={`dignity-section__status dignity-section__status--${dignity.successionStatus}`}>
                      {SUCCESSION_STATUS[dignity.successionStatus]?.name}
                    </span>
                  )}
                </h2>

                {/* Succession Rules Summary */}
                <div className="dignity-succession-rules">
                  <div className="dignity-succession-rules__header">
                    <h4>Succession Rules</h4>
                    <button className="dignity-succession-rules__edit" onClick={handleOpenSuccessionRules}>
                      <Icon name="settings" size={14} />
                      <span>Configure</span>
                    </button>
                  </div>
                  <div className="dignity-succession-rules__details">
                    <div className="dignity-succession-rules__item">
                      <span className="dignity-succession-rules__label">Type:</span>
                      <span className="dignity-succession-rules__value">
                        {SUCCESSION_TYPES[dignity.successionType || 'male-primogeniture']?.name}
                      </span>
                    </div>
                    {dignity.designatedHeirId && (
                      <div className="dignity-succession-rules__item dignity-succession-rules__item--designated">
                        <span className="dignity-succession-rules__label">Designated Heir:</span>
                        <span className="dignity-succession-rules__value">
                          {getPersonName(dignity.designatedHeirId)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Interregnum Alert */}
                {dignity.interregnum && (
                  <div className="dignity-interregnum">
                    <div className="dignity-interregnum__header">
                      <Icon name="hourglass" size={18} />
                      <span>Currently in Interregnum</span>
                    </div>
                    <div className="dignity-interregnum__details">
                      {dignity.interregnum.regentId && (
                        <p>
                          <strong>{dignity.interregnum.regentTitle}:</strong>{' '}
                          {getPersonName(dignity.interregnum.regentId)}
                        </p>
                      )}
                      {dignity.interregnum.reason && (
                        <p>
                          <strong>Reason:</strong>{' '}
                          {INTERREGNUM_REASONS[dignity.interregnum.reason]?.name || dignity.interregnum.reason}
                        </p>
                      )}
                      {dignity.interregnum.startDate && (
                        <p><strong>Since:</strong> {formatDate(dignity.interregnum.startDate)}</p>
                      )}
                    </div>
                    <div className="dignity-interregnum__actions">
                      <button
                        className="dignity-interregnum__end"
                        onClick={handleEndInterregnum}
                        disabled={successionLine.length === 0}
                      >
                        <Icon name="check" size={14} />
                        <span>End Interregnum</span>
                      </button>
                      <button className="dignity-interregnum__edit" onClick={handleOpenInterregnum}>
                        <Icon name="edit-3" size={14} />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Line of Succession */}
                <div className="dignity-succession-line">
                  <div className="dignity-succession-line__header">
                    <h4>Line of Succession</h4>
                    {!dignity.interregnum && !dignity.isVacant && (
                      <button className="dignity-succession-line__set-interregnum" onClick={handleOpenInterregnum}>
                        <Icon name="hourglass" size={14} />
                        <span>Set Interregnum</span>
                      </button>
                    )}
                  </div>

                  {loadingSuccession ? (
                    <div className="dignity-succession-line__loading">
                      <Icon name="loader-2" size={16} className="spin" />
                      <span>Calculating succession...</span>
                    </div>
                  ) : successionLine.length === 0 ? (
                    <div className="dignity-succession-line__empty">
                      <p>
                        {!dignity.currentHolderId
                          ? 'No current holder - cannot calculate succession.'
                          : 'No eligible heirs found in the family tree.'}
                      </p>
                    </div>
                  ) : (
                    <div className="dignity-succession-line__list">
                      {successionLine.slice(0, 10).map((candidate, index) => (
                        <div
                          key={candidate.personId}
                          className={`dignity-succession-line__item ${candidate.excluded ? 'dignity-succession-line__item--excluded' : ''} ${index === 0 && !candidate.excluded ? 'dignity-succession-line__item--heir' : ''}`}
                        >
                          <div className="dignity-succession-line__position">
                            {candidate.excluded ? <Icon name="x" size={12} /> : candidate.position}
                          </div>
                          <div className="dignity-succession-line__person">
                            <span className="dignity-succession-line__name">
                              {getPersonName(candidate.personId)}
                            </span>
                            <span className="dignity-succession-line__relationship">
                              {candidate.relationship}
                              {candidate.branch === 'collateral' && ' (collateral)'}
                            </span>
                          </div>
                          {candidate.excluded && (
                            <span className="dignity-succession-line__exclusion">
                              {candidate.exclusionReason}
                            </span>
                          )}
                          {index === 0 && !candidate.excluded && (
                            <span className="dignity-succession-line__heir-badge">Heir</span>
                          )}
                        </div>
                      ))}
                      {successionLine.length > 10 && (
                        <div className="dignity-succession-line__more">
                          +{successionLine.length - 10} more in line
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Disputed Claims */}
                <div className="dignity-disputes">
                  <div className="dignity-disputes__header">
                    <h4>
                      Disputed Claims
                      {dignity.disputes && dignity.disputes.filter(d => d.resolution === 'ongoing').length > 0 && (
                        <span className="dignity-disputes__count">
                          ({dignity.disputes.filter(d => d.resolution === 'ongoing').length} active)
                        </span>
                      )}
                    </h4>
                    <button className="dignity-disputes__add" onClick={handleOpenAddDispute}>
                      <Icon name="plus" size={14} />
                      <span>Add Claim</span>
                    </button>
                  </div>

                  {(!dignity.disputes || dignity.disputes.length === 0) ? (
                    <div className="dignity-disputes__empty">
                      <p>No disputed claims on this dignity.</p>
                    </div>
                  ) : (
                    <div className="dignity-disputes__list">
                      {dignity.disputes.map(dispute => (
                        <div
                          key={dispute.id}
                          className={`dignity-disputes__item dignity-disputes__item--${dispute.resolution}`}
                        >
                          <div className="dignity-disputes__item-header">
                            <span className="dignity-disputes__claimant">
                              <Icon name={CLAIM_TYPES[dispute.claimType]?.icon || 'user'} size={14} />
                              {getPersonName(dispute.claimantId)}
                            </span>
                            <span className={`dignity-disputes__strength dignity-disputes__strength--${dispute.claimStrength}`}>
                              {CLAIM_STRENGTHS[dispute.claimStrength]?.name}
                            </span>
                          </div>
                          <div className="dignity-disputes__item-details">
                            <span>{CLAIM_TYPES[dispute.claimType]?.name} claim</span>
                            {dispute.startDate && (
                              <span>Since {formatDate(dispute.startDate)}</span>
                            )}
                          </div>
                          {dispute.claimBasis && (
                            <p className="dignity-disputes__basis">"{dispute.claimBasis}"</p>
                          )}
                          {dispute.resolution !== 'ongoing' && (
                            <div className="dignity-disputes__resolution">
                              <span className="dignity-disputes__resolution-badge">
                                {DISPUTE_RESOLUTIONS[dispute.resolution]?.name}
                              </span>
                              {dispute.resolvedDate && (
                                <span className="dignity-disputes__resolved-date">
                                  {formatDate(dispute.resolvedDate)}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="dignity-disputes__actions">
                            {dispute.resolution === 'ongoing' && (
                              <button
                                className="dignity-disputes__resolve"
                                onClick={() => handleOpenResolveDispute(dispute)}
                              >
                                <Icon name="check" size={12} />
                                <span>Resolve</span>
                              </button>
                            )}
                            <button
                              className="dignity-disputes__remove"
                              onClick={() => handleRemoveDispute(dispute.id)}
                            >
                              <Icon name="trash-2" size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.section>

              {/* Tenure History Section */}
              <motion.section className="dignity-section" variants={CARD_VARIANTS}>
                <h2 className="dignity-section__title">
                  <Icon name="scroll-text" size={18} />
                  <span>Tenure History</span>
                </h2>

                <div className="dignity-tenure__actions">
                  <button className="dignity-tenure__add" onClick={handleOpenAddTenure}>
                    <Icon name="plus" size={14} />
                    <span>Add Tenure Record</span>
                  </button>
                </div>

                {tenures.length === 0 ? (
                  <div className="dignity-tenure__empty">
                    <p>No tenure records have been added yet.</p>
                  </div>
                ) : (
                  <div className="dignity-tenure__list">
                    {tenures.map((tenure, index) => {
                      const isCurrentTenure = !tenure.dateEnded;
                      const personName = getPersonName(tenure.personId);

                      return (
                        <div
                          key={tenure.id}
                          className={`dignity-tenure__item ${isCurrentTenure ? 'dignity-tenure__item--current' : ''}`}
                        >
                          <div className="dignity-tenure__number">
                            {tenures.length - index}
                          </div>
                          <div className="dignity-tenure__content">
                            <div className="dignity-tenure__header">
                              <span className="dignity-tenure__holder">
                                {personName || 'Unknown Person'}
                              </span>
                              {isCurrentTenure && (
                                <span className="dignity-tenure__current-badge">Current</span>
                              )}
                            </div>
                            <div className="dignity-tenure__dates">
                              {formatDate(tenure.dateStarted)} — {tenure.dateEnded ? formatDate(tenure.dateEnded) : 'Present'}
                            </div>
                            <div className="dignity-tenure__details">
                              {tenure.acquisitionType && (
                                <span>Acquired by: {ACQUISITION_TYPES[tenure.acquisitionType]?.name || tenure.acquisitionType}</span>
                              )}
                              {tenure.endType && (
                                <span>Ended by: {END_TYPES[tenure.endType]?.name || tenure.endType}</span>
                              )}
                            </div>
                            {tenure.notes && (
                              <div className="dignity-tenure__notes">{tenure.notes}</div>
                            )}
                            <div className="dignity-tenure__item-actions">
                              {isCurrentTenure && (
                                <button
                                  className="dignity-tenure__end-btn"
                                  onClick={() => handleOpenEndTenure(tenure)}
                                >
                                  <Icon name="square" size={12} />
                                  <span>End Tenure</span>
                                </button>
                              )}
                              <button
                                className="dignity-tenure__delete-btn"
                                onClick={() => handleDeleteTenure(tenure.id)}
                              >
                                <Icon name="trash-2" size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.section>
            </div>

            {/* Right Column - Sidebar */}
            <motion.aside className="dignity-view-sidebar" variants={ITEM_VARIANTS}>
              {/* Quick Facts */}
              <div className="dignity-sidebar-section">
                <h3 className="dignity-sidebar-section__title">Quick Facts</h3>
                <dl className="dignity-sidebar-facts">
                  <div className="dignity-sidebar-facts__item">
                    <dt>Class</dt>
                    <dd>
                      <Icon name={classIcon} size={14} />
                      <span>{classInfo?.name}</span>
                    </dd>
                  </div>
                  <div className="dignity-sidebar-facts__item">
                    <dt>Rank</dt>
                    <dd>{rankInfo?.name || 'Unknown'}</dd>
                  </div>
                  <div className="dignity-sidebar-facts__item">
                    <dt>Type</dt>
                    <dd>{dignity.isHereditary ? 'Hereditary' : 'Personal/Appointed'}</dd>
                  </div>
                  <div className="dignity-sidebar-facts__item">
                    <dt>Status</dt>
                    <dd>
                      {dignity.isVacant ? (
                        <>
                          <Icon name="alert-triangle" size={12} />
                          <span>Vacant</span>
                        </>
                      ) : (
                        <>
                          <Icon name="check" size={12} />
                          <span>Held</span>
                        </>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Location */}
              {(dignity.placeName || dignity.seatName) && (
                <div className="dignity-sidebar-section">
                  <h3 className="dignity-sidebar-section__title">Location</h3>
                  <dl className="dignity-sidebar-facts">
                    {dignity.placeName && (
                      <div className="dignity-sidebar-facts__item">
                        <dt>Place</dt>
                        <dd>
                          <Icon name="map-pin" size={12} />
                          <span>{dignity.placeName}</span>
                        </dd>
                      </div>
                    )}
                    {dignity.seatName && (
                      <div className="dignity-sidebar-facts__item">
                        <dt>Seat</dt>
                        <dd>
                          <Icon name="castle" size={12} />
                          <span>{dignity.seatName}</span>
                        </dd>
                      </div>
                    )}
                    {dignity.tenureType && (
                      <div className="dignity-sidebar-facts__item">
                        <dt>Tenure Style</dt>
                        <dd>{TENURE_TYPES[dignity.tenureType]?.name || dignity.tenureType}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Notes */}
              {dignity.notes && (
                <div className="dignity-sidebar-section">
                  <h3 className="dignity-sidebar-section__title">Notes</h3>
                  <p className="dignity-sidebar-notes">{dignity.notes}</p>
                </div>
              )}

              {/* Metadata */}
              <div className="dignity-sidebar-section dignity-sidebar-section--metadata">
                <h3 className="dignity-sidebar-section__title">Record Info</h3>
                <dl className="dignity-sidebar-facts">
                  <div className="dignity-sidebar-facts__item">
                    <dt>Created</dt>
                    <dd>{formatTimestamp(dignity.created)}</dd>
                  </div>
                  <div className="dignity-sidebar-facts__item">
                    <dt>Updated</dt>
                    <dd>{formatTimestamp(dignity.updated)}</dd>
                  </div>
                  <div className="dignity-sidebar-facts__item">
                    <dt>Record ID</dt>
                    <dd>#{dignity.id}</dd>
                  </div>
                </dl>
              </div>

              {/* Data Quality Suggestions */}
              {entitySuggestions.length > 0 && (
                <div className="dignity-sidebar-section dignity-sidebar-section--suggestions">
                  <h3 className="dignity-sidebar-section__title">
                    <Icon name="lightbulb" size={14} />
                    Suggestions
                  </h3>
                  <div className="dignity-sidebar-suggestions">
                    {entitySuggestions.slice(0, 3).map(suggestion => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        onApply={applySuggestion}
                        onDismiss={dismissSuggestion}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.aside>
          </div>
        </motion.div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* Tenure Modal */}
        {showTenureModal && (
          <motion.div
            className="dignity-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseTenureModal}
          >
            <motion.div
              className="dignity-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="dignity-modal__header">
                <h3>
                  <Icon name={tenureMode === 'end' ? 'square' : 'scroll-text'} size={18} />
                  <span>{tenureMode === 'end' ? 'End Tenure' : 'Add Tenure Record'}</span>
                </h3>
                <button className="dignity-modal__close" onClick={handleCloseTenureModal}>
                  <Icon name="x" size={18} />
                </button>
              </div>

              <div className="dignity-modal__body">
                {tenureMode === 'end' ? (
                  <>
                    <p className="dignity-modal__description">
                      Recording the end of <strong>{getPersonName(editingTenure?.personId)}</strong>'s
                      tenure as <strong>{dignity?.name}</strong>.
                    </p>

                    <div className="dignity-form__group">
                      <label>Date Ended</label>
                      <input
                        type="text"
                        value={tenureForm.dateEnded}
                        onChange={(e) => setTenureForm({ ...tenureForm, dateEnded: e.target.value })}
                        placeholder="e.g., 1287 or 1287-03-15"
                      />
                    </div>

                    <div className="dignity-form__group">
                      <label>How Did It End?</label>
                      <select
                        value={tenureForm.endType}
                        onChange={(e) => setTenureForm({ ...tenureForm, endType: e.target.value })}
                      >
                        <option value="">— Select —</option>
                        {Object.entries(END_TYPES).map(([key, info]) => (
                          <option key={key} value={key}>{info.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dignity-form__group">
                      <label>Who Held This Dignity? *</label>
                      <select
                        value={tenureForm.personId}
                        onChange={(e) => setTenureForm({ ...tenureForm, personId: e.target.value })}
                        required
                      >
                        <option value="">— Select Person —</option>
                        {people
                          .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {p.firstName} {p.lastName}
                              {houses.find(h => h.id === p.houseId)?.houseName &&
                                ` (${houses.find(h => h.id === p.houseId).houseName})`
                              }
                            </option>
                          ))
                        }
                      </select>
                    </div>

                    <div className="dignity-form__row">
                      <div className="dignity-form__group">
                        <label>Date Started</label>
                        <input
                          type="text"
                          value={tenureForm.dateStarted}
                          onChange={(e) => setTenureForm({ ...tenureForm, dateStarted: e.target.value })}
                          placeholder="e.g., 1245"
                        />
                      </div>

                      <div className="dignity-form__group">
                        <label>Date Ended</label>
                        <input
                          type="text"
                          value={tenureForm.dateEnded}
                          onChange={(e) => setTenureForm({ ...tenureForm, dateEnded: e.target.value })}
                          placeholder="Leave blank if current"
                        />
                      </div>
                    </div>

                    <div className="dignity-form__row">
                      <div className="dignity-form__group">
                        <label>How Acquired?</label>
                        <select
                          value={tenureForm.acquisitionType}
                          onChange={(e) => setTenureForm({ ...tenureForm, acquisitionType: e.target.value })}
                        >
                          {Object.entries(ACQUISITION_TYPES).map(([key, info]) => (
                            <option key={key} value={key}>{info.name}</option>
                          ))}
                        </select>
                      </div>

                      {tenureForm.dateEnded && (
                        <div className="dignity-form__group">
                          <label>How Ended?</label>
                          <select
                            value={tenureForm.endType}
                            onChange={(e) => setTenureForm({ ...tenureForm, endType: e.target.value })}
                          >
                            <option value="">— Select —</option>
                            {Object.entries(END_TYPES).map(([key, info]) => (
                              <option key={key} value={key}>{info.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="dignity-form__group">
                  <label>Notes</label>
                  <textarea
                    value={tenureForm.notes}
                    onChange={(e) => setTenureForm({ ...tenureForm, notes: e.target.value })}
                    placeholder="Any additional details..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="dignity-modal__footer">
                <button className="dignity-modal__cancel" onClick={handleCloseTenureModal}>
                  Cancel
                </button>
                <button
                  className="dignity-modal__save"
                  onClick={handleSaveTenure}
                  disabled={savingTenure || (tenureMode === 'add' && !tenureForm.personId)}
                >
                  {savingTenure ? 'Saving...' : (tenureMode === 'end' ? 'End Tenure' : 'Add Record')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Succession Rules Modal */}
        {showSuccessionRulesModal && (
          <motion.div
            className="dignity-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseSuccessionRulesModal}
          >
            <motion.div
              className="dignity-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="dignity-modal__header">
                <h3>
                  <Icon name="crown" size={18} />
                  <span>Succession Rules</span>
                </h3>
                <button className="dignity-modal__close" onClick={handleCloseSuccessionRulesModal}>
                  <Icon name="x" size={18} />
                </button>
              </div>

              <div className="dignity-modal__body">
                <div className="dignity-form__group">
                  <label>Succession Type *</label>
                  <select
                    value={successionRulesForm.successionType}
                    onChange={(e) => setSuccessionRulesForm({ ...successionRulesForm, successionType: e.target.value })}
                  >
                    {Object.entries(SUCCESSION_TYPES).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.name}
                      </option>
                    ))}
                  </select>
                  <p className="dignity-form__hint">
                    {SUCCESSION_TYPES[successionRulesForm.successionType]?.description}
                  </p>
                </div>

                {SUCCESSION_TYPES[successionRulesForm.successionType]?.autoCalculate && (
                  <>
                    <div className="dignity-form__group dignity-form__group--checkbox">
                      <label>
                        <input
                          type="checkbox"
                          checked={successionRulesForm.excludeBastards}
                          onChange={(e) => setSuccessionRulesForm({ ...successionRulesForm, excludeBastards: e.target.checked })}
                        />
                        Exclude bastards from succession
                      </label>
                    </div>

                    {successionRulesForm.excludeBastards && (
                      <div className="dignity-form__group dignity-form__group--checkbox dignity-form__group--indent">
                        <label>
                          <input
                            type="checkbox"
                            checked={successionRulesForm.legitimizedBastardsEligible}
                            onChange={(e) => setSuccessionRulesForm({ ...successionRulesForm, legitimizedBastardsEligible: e.target.checked })}
                          />
                          Legitimized bastards are eligible
                        </label>
                      </div>
                    )}
                  </>
                )}

                <div className="dignity-form__group">
                  <label>Designated Heir (Override)</label>
                  <select
                    value={successionRulesForm.designatedHeirId}
                    onChange={(e) => setSuccessionRulesForm({ ...successionRulesForm, designatedHeirId: e.target.value })}
                  >
                    <option value="">— Use calculated succession —</option>
                    {people
                      .filter(p => !p.dateOfDeath)
                      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                          {houses.find(h => h.id === p.houseId)?.houseName &&
                            ` (${houses.find(h => h.id === p.houseId).houseName})`
                          }
                        </option>
                      ))
                    }
                  </select>
                  <p className="dignity-form__hint">
                    Override automatic succession with a specific heir.
                  </p>
                </div>

                <div className="dignity-form__group">
                  <label>Custom Notes</label>
                  <textarea
                    value={successionRulesForm.customNotes}
                    onChange={(e) => setSuccessionRulesForm({ ...successionRulesForm, customNotes: e.target.value })}
                    placeholder="Any special succession rules or notes..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="dignity-modal__footer">
                <button className="dignity-modal__cancel" onClick={handleCloseSuccessionRulesModal}>
                  Cancel
                </button>
                <button
                  className="dignity-modal__save"
                  onClick={handleSaveSuccessionRules}
                  disabled={savingRules}
                >
                  {savingRules ? 'Saving...' : 'Save Rules'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Dispute Modal */}
        {showDisputeModal && (
          <motion.div
            className="dignity-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseDisputeModal}
          >
            <motion.div
              className="dignity-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="dignity-modal__header">
                <h3>
                  <Icon name={disputeMode === 'resolve' ? 'check' : 'swords'} size={18} />
                  <span>{disputeMode === 'resolve' ? 'Resolve Dispute' : 'Add Disputed Claim'}</span>
                </h3>
                <button className="dignity-modal__close" onClick={handleCloseDisputeModal}>
                  <Icon name="x" size={18} />
                </button>
              </div>

              <div className="dignity-modal__body">
                {disputeMode === 'resolve' ? (
                  <>
                    <p className="dignity-modal__description">
                      Resolving <strong>{getPersonName(editingDispute?.claimantId)}</strong>'s
                      claim to <strong>{dignity?.name}</strong>.
                    </p>

                    <div className="dignity-form__group">
                      <label>Resolution *</label>
                      <select
                        value={disputeForm.resolution}
                        onChange={(e) => setDisputeForm({ ...disputeForm, resolution: e.target.value })}
                      >
                        <option value="">— Select Resolution —</option>
                        {Object.entries(DISPUTE_RESOLUTIONS)
                          .filter(([key]) => key !== 'ongoing')
                          .map(([key, info]) => (
                            <option key={key} value={key}>{info.name}</option>
                          ))
                        }
                      </select>
                    </div>

                    <div className="dignity-form__group">
                      <label>Date Resolved</label>
                      <input
                        type="text"
                        value={disputeForm.resolvedDate}
                        onChange={(e) => setDisputeForm({ ...disputeForm, resolvedDate: e.target.value })}
                        placeholder="e.g., 1287"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dignity-form__group">
                      <label>Claimant *</label>
                      <select
                        value={disputeForm.claimantId}
                        onChange={(e) => setDisputeForm({ ...disputeForm, claimantId: e.target.value })}
                      >
                        <option value="">— Select Claimant —</option>
                        {people
                          .filter(p => !p.dateOfDeath)
                          .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {p.firstName} {p.lastName}
                              {houses.find(h => h.id === p.houseId)?.houseName &&
                                ` (${houses.find(h => h.id === p.houseId).houseName})`
                              }
                            </option>
                          ))
                        }
                      </select>
                    </div>

                    <div className="dignity-form__row">
                      <div className="dignity-form__group">
                        <label>Claim Type</label>
                        <select
                          value={disputeForm.claimType}
                          onChange={(e) => setDisputeForm({ ...disputeForm, claimType: e.target.value })}
                        >
                          {Object.entries(CLAIM_TYPES).map(([key, info]) => (
                            <option key={key} value={key}>{info.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="dignity-form__group">
                        <label>Claim Strength</label>
                        <select
                          value={disputeForm.claimStrength}
                          onChange={(e) => setDisputeForm({ ...disputeForm, claimStrength: e.target.value })}
                        >
                          {Object.entries(CLAIM_STRENGTHS).map(([key, info]) => (
                            <option key={key} value={key}>{info.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="dignity-form__group">
                      <label>Claim Basis</label>
                      <input
                        type="text"
                        value={disputeForm.claimBasis}
                        onChange={(e) => setDisputeForm({ ...disputeForm, claimBasis: e.target.value })}
                        placeholder="e.g., Grandson of King Aldric through female line"
                      />
                    </div>

                    <div className="dignity-form__row">
                      <div className="dignity-form__group">
                        <label>Date Claim Made</label>
                        <input
                          type="text"
                          value={disputeForm.startDate}
                          onChange={(e) => setDisputeForm({ ...disputeForm, startDate: e.target.value })}
                          placeholder="e.g., 1285"
                        />
                      </div>

                      <div className="dignity-form__group">
                        <label>Supporting Factions</label>
                        <input
                          type="text"
                          value={disputeForm.supportingFactions}
                          onChange={(e) => setDisputeForm({ ...disputeForm, supportingFactions: e.target.value })}
                          placeholder="Comma-separated list"
                        />
                      </div>
                    </div>

                    <div className="dignity-form__group">
                      <label>Notes</label>
                      <textarea
                        value={disputeForm.notes}
                        onChange={(e) => setDisputeForm({ ...disputeForm, notes: e.target.value })}
                        placeholder="Additional details about the claim..."
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="dignity-modal__footer">
                <button className="dignity-modal__cancel" onClick={handleCloseDisputeModal}>
                  Cancel
                </button>
                <button
                  className="dignity-modal__save"
                  onClick={handleSaveDispute}
                  disabled={savingDispute || (disputeMode === 'add' && !disputeForm.claimantId) || (disputeMode === 'resolve' && !disputeForm.resolution)}
                >
                  {savingDispute ? 'Saving...' : (disputeMode === 'resolve' ? 'Resolve Claim' : 'Add Claim')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Interregnum Modal */}
        {showInterregnumModal && (
          <motion.div
            className="dignity-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseInterregnumModal}
          >
            <motion.div
              className="dignity-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="dignity-modal__header">
                <h3>
                  <Icon name="hourglass" size={18} />
                  <span>Set Interregnum</span>
                </h3>
                <button className="dignity-modal__close" onClick={handleCloseInterregnumModal}>
                  <Icon name="x" size={18} />
                </button>
              </div>

              <div className="dignity-modal__body">
                <p className="dignity-modal__description">
                  An interregnum is a period between rulers when the dignity is vacant or
                  the holder cannot exercise power (e.g., minority, incapacity).
                </p>

                <div className="dignity-form__group">
                  <label>Reason</label>
                  <select
                    value={interregnumForm.reason}
                    onChange={(e) => setInterregnumForm({ ...interregnumForm, reason: e.target.value })}
                  >
                    {Object.entries(INTERREGNUM_REASONS).map(([key, info]) => (
                      <option key={key} value={key}>{info.name}</option>
                    ))}
                  </select>
                  <p className="dignity-form__hint">
                    {INTERREGNUM_REASONS[interregnumForm.reason]?.description}
                  </p>
                </div>

                <div className="dignity-form__group">
                  <label>Start Date</label>
                  <input
                    type="text"
                    value={interregnumForm.startDate}
                    onChange={(e) => setInterregnumForm({ ...interregnumForm, startDate: e.target.value })}
                    placeholder="e.g., 1287"
                  />
                </div>

                <div className="dignity-form__group">
                  <label>Regent (if applicable)</label>
                  <select
                    value={interregnumForm.regentId}
                    onChange={(e) => setInterregnumForm({ ...interregnumForm, regentId: e.target.value })}
                  >
                    <option value="">— No Regent —</option>
                    {people
                      .filter(p => !p.dateOfDeath)
                      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                          {houses.find(h => h.id === p.houseId)?.houseName &&
                            ` (${houses.find(h => h.id === p.houseId).houseName})`
                          }
                        </option>
                      ))
                    }
                  </select>
                </div>

                {interregnumForm.regentId && (
                  <div className="dignity-form__group">
                    <label>Regent's Title</label>
                    <input
                      type="text"
                      value={interregnumForm.regentTitle}
                      onChange={(e) => setInterregnumForm({ ...interregnumForm, regentTitle: e.target.value })}
                      placeholder="e.g., Lord Protector, Queen Regent"
                    />
                  </div>
                )}

                <div className="dignity-form__group">
                  <label>Notes</label>
                  <textarea
                    value={interregnumForm.notes}
                    onChange={(e) => setInterregnumForm({ ...interregnumForm, notes: e.target.value })}
                    placeholder="Additional details about the interregnum..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="dignity-modal__footer">
                <button className="dignity-modal__cancel" onClick={handleCloseInterregnumModal}>
                  Cancel
                </button>
                <button
                  className="dignity-modal__save"
                  onClick={handleSaveInterregnum}
                  disabled={savingInterregnum}
                >
                  {savingInterregnum ? 'Saving...' : 'Set Interregnum'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default DignityView;
