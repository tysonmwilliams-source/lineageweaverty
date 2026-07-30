/**
 * DignityForm.jsx - Create/Edit Dignity Form
 *
 * A comprehensive form for recording dignities based on
 * "The Codified Charter of Driht, Ward, and Service"
 *
 * Handles both create and edit modes based on URL.
 * Features smart filtering for holder/house selection.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import {
  createDignity,
  getDignity,
  updateDignity,
  getAllDignities,
  DIGNITY_CLASSES,
  DIGNITY_RANKS,
  DIGNITY_NATURES,
  TENURE_TYPES,
  FEALTY_TYPES,
  DISPLAY_ICONS,
  natureHasSuccession,
  natureHasGrantTracking
} from '../services/dignityService';
import { getAllHouses, getAllPeople } from '../services/database';
import Navigation from '../components/Navigation';
import Icon from '../components/icons/Icon';
import ActionButton from '../components/shared/ActionButton';
import LoadingState from '../components/shared/LoadingState';
import './DignityForm.css';
import { logger } from '../utils/logger';

const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4 }
  }
};

const SECTION_ICONS = {
  classification: 'layout-grid',
  identity: 'tag',
  hierarchy: 'git-branch',
  holder: 'user',
  display: 'palette',
  notes: 'file-text'
};

function DignityForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { activeDataset } = useDataset();
  const isEditMode = Boolean(id);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    shortName: '',
    dignityClass: 'driht',
    dignityRank: 'drith',
    dignityNature: 'territorial',
    tenureType: 'of',
    placeName: '',
    seatName: '',
    swornToId: '',
    fealtyType: 'sworn-to',
    currentHolderId: '',
    currentHouseId: '',
    isVacant: false,
    // Grant tracking (for office/personal-honour)
    grantedById: '',
    grantedByDignityId: '',
    grantDate: '',
    displayIcon: '',
    displayPriority: 0,
    notes: ''
  });

  // Reference data
  const [houses, setHouses] = useState([]);
  const [people, setPeople] = useState([]);
  const [dignities, setDignities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Load reference data and existing dignity if editing
  useEffect(() => {
    loadData();
  }, [id, activeDataset]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const datasetId = activeDataset?.id;

      const [housesData, peopleData, dignitiesData] = await Promise.all([
        getAllHouses(datasetId),
        getAllPeople(datasetId),
        getAllDignities(datasetId)
      ]);

      setHouses(housesData);
      setPeople(peopleData);
      setDignities(dignitiesData);

      if (isEditMode) {
        const dignity = await getDignity(parseInt(id), datasetId);
        if (dignity) {
          // Determine nature: use stored value, or infer from legacy isHereditary
          let nature = dignity.dignityNature;
          if (!nature) {
            if (dignity.dignityClass === 'sir') {
              nature = 'personal-honour';
            } else if (dignity.isHereditary === false) {
              nature = 'office';
            } else {
              nature = 'territorial';
            }
          }

          setFormData({
            name: dignity.name || '',
            shortName: dignity.shortName || '',
            dignityClass: dignity.dignityClass || 'driht',
            dignityRank: dignity.dignityRank || 'drith',
            dignityNature: nature,
            tenureType: dignity.tenureType || 'of',
            placeName: dignity.placeName || '',
            seatName: dignity.seatName || '',
            swornToId: dignity.swornToId || '',
            fealtyType: dignity.fealtyType || 'sworn-to',
            currentHolderId: dignity.currentHolderId || '',
            currentHouseId: dignity.currentHouseId || '',
            isVacant: dignity.isVacant || false,
            grantedById: dignity.grantedById || '',
            grantedByDignityId: dignity.grantedByDignityId || '',
            grantDate: dignity.grantDate || '',
            displayIcon: dignity.displayIcon || '',
            displayPriority: dignity.displayPriority || 0,
            notes: dignity.notes || ''
          });
        } else {
          setError('Dignity not found');
        }
      } else {
        const preHouseId = searchParams.get('houseId');
        const prePersonId = searchParams.get('personId');

        if (preHouseId) {
          setFormData(prev => ({ ...prev, currentHouseId: parseInt(preHouseId) }));
        }
        if (prePersonId) {
          setFormData(prev => ({ ...prev, currentHolderId: parseInt(prePersonId) }));
        }
      }

      setLoading(false);
    } catch (err) {
      logger.error('Error loading data:', err);
      setError('Failed to load data');
      setLoading(false);
    }
  }

  function getAvailableRanks() {
    const classRanks = DIGNITY_RANKS[formData.dignityClass];
    if (!classRanks) return [];
    return Object.values(classRanks);
  }

  function getSwornToOptions() {
    let options = [...dignities];

    if (isEditMode) {
      const currentId = parseInt(id);
      options = options.filter(d => d.id !== currentId);

      function getSubordinateIds(dignityId, visited = new Set()) {
        if (visited.has(dignityId)) return visited;
        visited.add(dignityId);
        const subs = dignities.filter(d => d.swornToId === dignityId);
        subs.forEach(sub => getSubordinateIds(sub.id, visited));
        return visited;
      }

      const subordinateIds = getSubordinateIds(currentId);
      subordinateIds.delete(currentId);
      options = options.filter(d => !subordinateIds.has(d.id));
    }

    return options;
  }

  function getFilteredPeople() {
    let filtered = [...people];

    if (formData.currentHouseId) {
      const selectedHouseId = parseInt(formData.currentHouseId);
      filtered = filtered.filter(p => p.houseId === selectedHouseId);
    }

    filtered.sort((a, b) => {
      const houseA = getHouseName(a.houseId) || 'zzz';
      const houseB = getHouseName(b.houseId) || 'zzz';
      const houseCompare = houseA.localeCompare(houseB);
      if (houseCompare !== 0) return houseCompare;
      const nameA = `${a.firstName} ${a.lastName}`;
      const nameB = `${b.firstName} ${b.lastName}`;
      return nameA.localeCompare(nameB);
    });

    return filtered;
  }

  function getFilteredHouses() {
    let filtered = [...houses];

    if (formData.currentHolderId) {
      const selectedPersonId = parseInt(formData.currentHolderId);
      const person = people.find(p => p.id === selectedPersonId);
      if (person?.houseId) {
        filtered = filtered.filter(h => h.id === person.houseId);
      }
    }

    filtered.sort((a, b) => (a.houseName || '').localeCompare(b.houseName || ''));
    return filtered;
  }

  function validateHolderSelection(newHouseId) {
    if (!formData.currentHolderId) return;
    const selectedPersonId = parseInt(formData.currentHolderId);
    const person = people.find(p => p.id === selectedPersonId);
    if (person && newHouseId && person.houseId !== parseInt(newHouseId)) {
      setFormData(prev => ({ ...prev, currentHolderId: '' }));
    }
  }

  function validateHouseSelection(newHolderId) {
    if (!newHolderId) return;
    const person = people.find(p => p.id === parseInt(newHolderId));
    if (person?.houseId) {
      setFormData(prev => ({ ...prev, currentHouseId: person.houseId }));
    }
  }

  function generateName() {
    if (!formData.placeName) return;

    const classRanks = DIGNITY_RANKS[formData.dignityClass];
    const rankInfo = classRanks?.[formData.dignityRank];
    const rankName = rankInfo?.name || 'Lord';

    if (formData.dignityClass === 'sir') {
      setFormData(prev => ({ ...prev, name: `Sir, Drithman of ${formData.placeName}` }));
      return;
    }

    if (formData.dignityClass === 'crown') {
      switch (formData.dignityRank) {
        case 'sovereign':
          setFormData(prev => ({ ...prev, name: `Crown of ${formData.placeName}` }));
          return;
        case 'heir':
          setFormData(prev => ({ ...prev, name: `Heir to ${formData.placeName}` }));
          return;
        case 'prince':
          setFormData(prev => ({ ...prev, name: `Prince of ${formData.placeName}` }));
          return;
      }
    }

    let generatedName = '';

    switch (formData.tenureType) {
      case 'of':
        generatedName = `${rankName} of ${formData.placeName}`;
        break;
      case 'in':
        generatedName = `${rankName} in ${formData.placeName}`;
        break;
      case 'at':
        generatedName = `${rankName} at ${formData.placeName}`;
        break;
      case 'of-house':
        generatedName = `${rankName} of the House of ${formData.placeName}`;
        break;
      case 'of-name':
        generatedName = `${rankName} of the Name of ${formData.placeName}`;
        break;
      case 'in-fee':
        generatedName = `${rankName} in Fee of ${formData.placeName}`;
        break;
      case 'in-wardship':
        generatedName = `${rankName} in Wardship under ${formData.placeName}`;
        break;
      default:
        generatedName = `${rankName} of ${formData.placeName}`;
    }

    setFormData(prev => ({ ...prev, name: generatedName }));
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    if (name === 'dignityClass') {
      const classRanks = DIGNITY_RANKS[value];
      if (classRanks) {
        const firstRank = Object.keys(classRanks)[0];
        // Auto-set default nature based on class
        let defaultNature = 'territorial';
        if (value === 'sir') {
          defaultNature = 'personal-honour';
        }
        setFormData(prev => ({
          ...prev,
          dignityRank: firstRank,
          dignityNature: defaultNature
        }));
      }
    }

    if (name === 'currentHolderId' && value) {
      validateHouseSelection(value);
    }

    if (name === 'currentHouseId' && value) {
      validateHolderSelection(value);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const datasetId = activeDataset?.id;

      const dignityData = {
        ...formData,
        name: formData.name.trim(),
        shortName: formData.shortName.trim() || null,
        placeName: formData.placeName.trim() || null,
        seatName: formData.seatName.trim() || null,
        swornToId: formData.swornToId ? parseInt(formData.swornToId) : null,
        currentHolderId: formData.currentHolderId ? parseInt(formData.currentHolderId) : null,
        currentHouseId: formData.currentHouseId ? parseInt(formData.currentHouseId) : null,
        // Derive isHereditary from nature for backward compatibility
        isHereditary: formData.dignityNature === 'territorial',
        // Grant tracking
        grantedById: formData.grantedById ? parseInt(formData.grantedById) : null,
        grantedByDignityId: formData.grantedByDignityId ? parseInt(formData.grantedByDignityId) : null,
        grantDate: formData.grantDate.trim() || null,
        displayPriority: parseInt(formData.displayPriority) || 0,
        notes: formData.notes.trim() || null
      };

      if (isEditMode) {
        await updateDignity(parseInt(id), dignityData, user?.uid, datasetId);
        navigate(`/dignities/view/${id}`);
      } else {
        const newId = await createDignity(dignityData, user?.uid, datasetId);
        navigate(`/dignities/view/${newId}`);
      }
    } catch (err) {
      logger.error('Error saving dignity:', err);
      setError('Failed to save dignity');
      setSaving(false);
    }
  }

  function getHouseName(houseId) {
    const house = houses.find(h => h.id === houseId);
    return house?.houseName || 'Unknown House';
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="dignity-form-page dignity-form-page--loading">
          <LoadingState message="Loading dignity data..." icon="scroll" />
        </div>
      </>
    );
  }

  const classInfo = DIGNITY_CLASSES[formData.dignityClass];
  const availableRanks = getAvailableRanks();
  const swornToOptions = getSwornToOptions();

  return (
    <>
      <Navigation />
      <motion.div
        className="dignity-form-page"
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.header className="dignity-form__header" variants={SECTION_VARIANTS}>
          <ActionButton
            icon="arrow-left"
            onClick={() => navigate('/dignities')}
            variant="ghost"
            size="sm"
          >
            Back to Rolls
          </ActionButton>
          <h1 className="dignity-form__title">
            <Icon name={isEditMode ? 'pencil' : 'plus'} size={28} />
            <span>{isEditMode ? 'Edit Dignity' : 'Record New Dignity'}</span>
          </h1>
          <p className="dignity-form__subtitle">
            Per Article VII - All grants shall be recorded in the rolls of the realm
          </p>
        </motion.header>

        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="dignity-form__error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Icon name="alert-circle" size={20} />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="dignity-form__error-close"
              >
                <Icon name="x" size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form */}
        <form className="dignity-form" onSubmit={handleSubmit}>
          {/* Classification Section */}
          <motion.section className="dignity-form__section" variants={SECTION_VARIANTS}>
            <h2 className="dignity-form__section-title">
              <Icon name={SECTION_ICONS.classification} size={20} />
              <span>Classification</span>
            </h2>
            <p className="dignity-form__section-desc">
              Define the type and rank of this dignity per the Charter
            </p>

            <div className="dignity-form__row">
              <div className="dignity-form__group">
                <label htmlFor="dignityClass" className="dignity-form__label">
                  Dignity Class *
                </label>
                <select
                  id="dignityClass"
                  name="dignityClass"
                  value={formData.dignityClass}
                  onChange={handleChange}
                  className="dignity-form__select"
                  required
                >
                  {Object.entries(DIGNITY_CLASSES).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.icon} {info.name} - {info.description}
                    </option>
                  ))}
                </select>
                <span className="dignity-form__hint">{classInfo?.description}</span>
              </div>

              <div className="dignity-form__group">
                <label htmlFor="dignityRank" className="dignity-form__label">
                  Rank *
                </label>
                <select
                  id="dignityRank"
                  name="dignityRank"
                  value={formData.dignityRank}
                  onChange={handleChange}
                  className="dignity-form__select"
                  required
                >
                  {availableRanks.map(rank => (
                    <option key={rank.id} value={rank.id}>
                      {rank.name} - {rank.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="dignity-form__row">
              <div className="dignity-form__group">
                <label htmlFor="dignityNature" className="dignity-form__label">
                  Dignity Nature *
                </label>
                <select
                  id="dignityNature"
                  name="dignityNature"
                  value={formData.dignityNature}
                  onChange={handleChange}
                  className="dignity-form__select"
                  required
                >
                  {Object.entries(DIGNITY_NATURES).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.name} - {info.description.split('.')[0]}
                    </option>
                  ))}
                </select>
                <span className="dignity-form__hint">
                  {DIGNITY_NATURES[formData.dignityNature]?.description}
                </span>
              </div>

              <div className="dignity-form__group dignity-form__group--checkbox">
                <label className="dignity-form__checkbox">
                  <input
                    type="checkbox"
                    name="isVacant"
                    checked={formData.isVacant}
                    onChange={handleChange}
                  />
                  <span>Currently Vacant</span>
                </label>
                <span className="dignity-form__hint">
                  No current holder of this dignity
                </span>
              </div>
            </div>

            {/* Nature-based info */}
            <div className="dignity-form__nature-info">
              <div className="dignity-form__nature-badges">
                {natureHasSuccession(formData.dignityNature) && (
                  <span className="dignity-form__nature-badge dignity-form__nature-badge--succession">
                    <Icon name="git-branch" size={14} />
                    <span>Has Succession</span>
                  </span>
                )}
                {natureHasGrantTracking(formData.dignityNature) && (
                  <span className="dignity-form__nature-badge dignity-form__nature-badge--grant">
                    <Icon name="stamp" size={14} />
                    <span>Tracks Grantor</span>
                  </span>
                )}
                {!natureHasSuccession(formData.dignityNature) && (
                  <span className="dignity-form__nature-badge dignity-form__nature-badge--personal">
                    <Icon name="user" size={14} />
                    <span>Non-Hereditary</span>
                  </span>
                )}
              </div>
            </div>
          </motion.section>

          {/* Identity Section */}
          <motion.section className="dignity-form__section" variants={SECTION_VARIANTS}>
            <h2 className="dignity-form__section-title">
              <Icon name={SECTION_ICONS.identity} size={20} />
              <span>Identity</span>
            </h2>
            <p className="dignity-form__section-desc">
              The formal name and styling of this dignity
            </p>

            <div className="dignity-form__row">
              <div className="dignity-form__group">
                <label htmlFor="tenureType" className="dignity-form__label">
                  Tenure Style (Article IV)
                </label>
                <select
                  id="tenureType"
                  name="tenureType"
                  value={formData.tenureType}
                  onChange={handleChange}
                  className="dignity-form__select"
                >
                  {Object.entries(TENURE_TYPES).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.name} - {info.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dignity-form__group">
                <label htmlFor="placeName" className="dignity-form__label">
                  Place/House Name
                </label>
                <div className="dignity-form__input-action">
                  <input
                    type="text"
                    id="placeName"
                    name="placeName"
                    value={formData.placeName}
                    onChange={handleChange}
                    placeholder="e.g., Breakmount, Wilfrey"
                    className="dignity-form__input"
                  />
                  <ActionButton
                    type="button"
                    icon="sparkles"
                    onClick={generateName}
                    disabled={!formData.placeName}
                    variant="secondary"
                    size="sm"
                    title="Generate name from place"
                  >
                    Generate
                  </ActionButton>
                </div>
              </div>
            </div>

            <div className="dignity-form__row">
              <div className="dignity-form__group dignity-form__group--full">
                <label htmlFor="name" className="dignity-form__label">
                  Full Title Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Lord of Breakmount"
                  className="dignity-form__input"
                  required
                />
                <span className="dignity-form__hint">
                  The complete formal title as it would appear in records
                </span>
              </div>
            </div>

            <div className="dignity-form__row">
              <div className="dignity-form__group">
                <label htmlFor="shortName" className="dignity-form__label">
                  Short Name
                </label>
                <input
                  type="text"
                  id="shortName"
                  name="shortName"
                  value={formData.shortName}
                  onChange={handleChange}
                  placeholder="e.g., Breakmount"
                  className="dignity-form__input"
                />
                <span className="dignity-form__hint">
                  Compact display name for lists and cards
                </span>
              </div>

              <div className="dignity-form__group">
                <label htmlFor="seatName" className="dignity-form__label">
                  Seat/Residence
                </label>
                <input
                  type="text"
                  id="seatName"
                  name="seatName"
                  value={formData.seatName}
                  onChange={handleChange}
                  placeholder="e.g., Breakmount Castle"
                  className="dignity-form__input"
                />
                <span className="dignity-form__hint">
                  Primary residence or seat of power
                </span>
              </div>
            </div>
          </motion.section>

          {/* Feudal Hierarchy Section */}
          <motion.section className="dignity-form__section" variants={SECTION_VARIANTS}>
            <h2 className="dignity-form__section-title">
              <Icon name={SECTION_ICONS.hierarchy} size={20} />
              <span>Feudal Hierarchy</span>
            </h2>
            <p className="dignity-form__section-desc">
              Article V - Fealty and sworn bonds
            </p>

            <div className="dignity-form__row">
              <div className="dignity-form__group">
                <label htmlFor="swornToId" className="dignity-form__label">
                  Sworn To
                </label>
                <select
                  id="swornToId"
                  name="swornToId"
                  value={formData.swornToId}
                  onChange={handleChange}
                  className="dignity-form__select"
                >
                  <option value="">- None (Apex/Crown) -</option>
                  {swornToOptions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <span className="dignity-form__hint">
                  The superior dignity to which this one owes fealty
                </span>
              </div>

              <div className="dignity-form__group">
                <label htmlFor="fealtyType" className="dignity-form__label">
                  Fealty Type
                </label>
                <select
                  id="fealtyType"
                  name="fealtyType"
                  value={formData.fealtyType}
                  onChange={handleChange}
                  className="dignity-form__select"
                  disabled={!formData.swornToId}
                >
                  {Object.entries(FEALTY_TYPES).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.name} - {info.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </motion.section>

          {/* Current Holder Section */}
          <motion.section className="dignity-form__section" variants={SECTION_VARIANTS}>
            <h2 className="dignity-form__section-title">
              <Icon name={SECTION_ICONS.holder} size={20} />
              <span>Current Holder</span>
            </h2>
            <p className="dignity-form__section-desc">
              Who currently holds this dignity
              {formData.currentHouseId && (
                <span className="dignity-form__filter-note">
                  {' '}- Showing members of {getHouseName(parseInt(formData.currentHouseId))}
                </span>
              )}
            </p>

            <div className="dignity-form__row">
              <div className="dignity-form__group">
                <label htmlFor="currentHouseId" className="dignity-form__label">
                  Associated House
                </label>
                <select
                  id="currentHouseId"
                  name="currentHouseId"
                  value={formData.currentHouseId}
                  onChange={handleChange}
                  className="dignity-form__select"
                >
                  <option value="">- All Houses -</option>
                  {getFilteredHouses().map(h => (
                    <option key={h.id} value={h.id}>{h.houseName}</option>
                  ))}
                </select>
                <span className="dignity-form__hint">
                  Select a house to filter available holders
                </span>
              </div>

              <div className="dignity-form__group">
                <label htmlFor="currentHolderId" className="dignity-form__label">
                  Current Holder
                  {formData.currentHouseId && (
                    <span className="dignity-form__filter-badge">
                      {getFilteredPeople().length} available
                    </span>
                  )}
                </label>
                <select
                  id="currentHolderId"
                  name="currentHolderId"
                  value={formData.currentHolderId}
                  onChange={handleChange}
                  className="dignity-form__select"
                  disabled={formData.isVacant}
                >
                  <option value="">- Select Person -</option>
                  {getFilteredPeople().map(p => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                      {!formData.currentHouseId && p.houseId && ` (${getHouseName(p.houseId)})`}
                    </option>
                  ))}
                </select>
                {formData.currentHouseId && getFilteredPeople().length === 0 && (
                  <span className="dignity-form__warning">No members found in this house</span>
                )}
              </div>
            </div>

            {(formData.currentHouseId || formData.currentHolderId) && (
              <div className="dignity-form__filter-actions">
                <button
                  type="button"
                  className="dignity-form__clear-btn"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    currentHouseId: '',
                    currentHolderId: ''
                  }))}
                >
                  <Icon name="x" size={14} />
                  <span>Clear holder & house selection</span>
                </button>
              </div>
            )}
          </motion.section>

          {/* Grant Tracking Section - Only for office/personal-honour */}
          <AnimatePresence>
            {natureHasGrantTracking(formData.dignityNature) && (
              <motion.section
                className="dignity-form__section dignity-form__section--grant"
                variants={SECTION_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                <h2 className="dignity-form__section-title">
                  <Icon name="stamp" size={20} />
                  <span>Grant Information</span>
                </h2>
                <p className="dignity-form__section-desc">
                  {formData.dignityNature === 'personal-honour'
                    ? 'Who granted this honour and when'
                    : 'Who appointed to this office and when'
                  }
                </p>

                <div className="dignity-form__row">
                  <div className="dignity-form__group">
                    <label htmlFor="grantedById" className="dignity-form__label">
                      Granted By
                    </label>
                    <select
                      id="grantedById"
                      name="grantedById"
                      value={formData.grantedById}
                      onChange={handleChange}
                      className="dignity-form__select"
                    >
                      <option value="">- Select Grantor -</option>
                      {people.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                          {p.houseId && ` (${getHouseName(p.houseId)})`}
                        </option>
                      ))}
                    </select>
                    <span className="dignity-form__hint">
                      The person who granted or appointed this dignity
                    </span>
                  </div>

                  <div className="dignity-form__group">
                    <label htmlFor="grantedByDignityId" className="dignity-form__label">
                      Acting Under (Optional)
                    </label>
                    <select
                      id="grantedByDignityId"
                      name="grantedByDignityId"
                      value={formData.grantedByDignityId}
                      onChange={handleChange}
                      className="dignity-form__select"
                      disabled={!formData.grantedById}
                    >
                      <option value="">- Select Dignity -</option>
                      {dignities
                        .filter(d => {
                          // Show dignities held by the grantor
                          if (!formData.grantedById) return true;
                          return d.currentHolderId === parseInt(formData.grantedById);
                        })
                        .map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))
                      }
                    </select>
                    <span className="dignity-form__hint">
                      What dignity were they acting under when granting (e.g., "as King")
                    </span>
                  </div>
                </div>

                <div className="dignity-form__row">
                  <div className="dignity-form__group">
                    <label htmlFor="grantDate" className="dignity-form__label">
                      Grant Date
                    </label>
                    <input
                      type="text"
                      id="grantDate"
                      name="grantDate"
                      value={formData.grantDate}
                      onChange={handleChange}
                      placeholder="e.g., 1287, Spring 1287, 15th Day of Summer"
                      className="dignity-form__input"
                    />
                    <span className="dignity-form__hint">
                      When this dignity was granted (flexible format)
                    </span>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Display Options Section */}
          <motion.section className="dignity-form__section" variants={SECTION_VARIANTS}>
            <h2 className="dignity-form__section-title">
              <Icon name={SECTION_ICONS.display} size={20} />
              <span>Display Options</span>
            </h2>
            <p className="dignity-form__section-desc">
              How this dignity appears in the family tree
            </p>

            <div className="dignity-form__row">
              <div className="dignity-form__group">
                <label htmlFor="displayIcon" className="dignity-form__label">
                  Tree Card Icon
                </label>
                <select
                  id="displayIcon"
                  name="displayIcon"
                  value={formData.displayIcon}
                  onChange={handleChange}
                  className="dignity-form__select"
                >
                  <option value="">- Auto (based on rank) -</option>
                  {Object.entries(DISPLAY_ICONS).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.icon} {info.name}
                    </option>
                  ))}
                </select>
                <span className="dignity-form__hint">
                  Icon shown on person cards in the family tree
                </span>
              </div>

              <div className="dignity-form__group">
                <label htmlFor="displayPriority" className="dignity-form__label">
                  Display Priority
                </label>
                <input
                  type="number"
                  id="displayPriority"
                  name="displayPriority"
                  value={formData.displayPriority}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  className="dignity-form__input"
                />
                <span className="dignity-form__hint">
                  Higher = shown first when person holds multiple dignities
                </span>
              </div>
            </div>
          </motion.section>

          {/* Notes Section */}
          <motion.section className="dignity-form__section" variants={SECTION_VARIANTS}>
            <h2 className="dignity-form__section-title">
              <Icon name={SECTION_ICONS.notes} size={20} />
              <span>Notes</span>
            </h2>

            <div className="dignity-form__group dignity-form__group--full">
              <label htmlFor="notes" className="dignity-form__label">
                Additional Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="4"
                placeholder="Any additional information about this dignity..."
                className="dignity-form__textarea"
              />
            </div>
          </motion.section>

          {/* Form Actions */}
          <motion.div className="dignity-form__actions" variants={SECTION_VARIANTS}>
            <ActionButton
              type="button"
              onClick={() => navigate('/dignities')}
              variant="ghost"
            >
              Cancel
            </ActionButton>
            <ActionButton
              type="submit"
              icon={isEditMode ? 'save' : 'plus'}
              disabled={saving}
              variant="primary"
            >
              {saving ? 'Saving...' : (isEditMode ? 'Update Dignity' : 'Record Dignity')}
            </ActionButton>
          </motion.div>
        </form>
      </motion.div>
    </>
  );
}

export default DignityForm;
