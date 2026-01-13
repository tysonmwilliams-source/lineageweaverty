/**
 * QuickEditPanel.jsx - Person & Relationship Management Sidebar
 *
 * Comprehensive sidebar for viewing and editing person details with:
 * - Person information and dates
 * - House heraldry display
 * - Personal arms section
 * - Biography/Codex integration
 * - Titles & Dignities
 * - Epithets management
 * - Family relationships (spouses, parents, children, siblings)
 * - Smart validation for relationship creation
 *
 * Medieval manuscript theme with Framer Motion animations.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGenealogy } from '../contexts/GenealogyContext';
import HouseHeraldrySection from './HouseHeraldrySection';
import PersonalArmsSection from './PersonalArmsSection';
import { getEntryByPersonId } from '../services/codexService';
import { getBiographyStatus, getStatusSummary } from '../utils/biographyStatus';
import { validateRelationship } from '../utils/SmartDataValidator';
import { getDignitiesForPerson, getDignityIcon, DIGNITY_CLASSES } from '../services/dignityService';
import EpithetsSection from './EpithetsSection';
import { getPrimaryEpithet } from '../utils/epithetUtils';
import Icon from './icons/Icon';
import ActionButton from './shared/ActionButton';
import './QuickEditPanel.css';

const PANEL_VARIANTS = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', damping: 25, stiffness: 300 }
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: 0.2 }
  }
};

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 }
  }
};

const MODAL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', damping: 25, stiffness: 300 }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 }
  }
};

const RELATION_CONFIG = {
  spouse: { icon: 'heart', label: 'Spouse', description: 'spouse for' },
  parent: { icon: 'crown', label: 'Parent', description: 'parent of' },
  child: { icon: 'baby', label: 'Child', description: 'child of' },
  sibling: { icon: 'users', label: 'Sibling', description: 'sibling of' }
};

function QuickEditPanel({
  person,
  onClose,
  onPersonSelect,
  isDarkTheme = true
}) {
  const {
    people,
    houses,
    relationships,
    addPerson,
    updatePerson,
    addRelationship
  } = useGenealogy();

  const navigate = useNavigate();

  // Local state
  const [editedPerson, setEditedPerson] = useState(person);
  const [addingRelationType, setAddingRelationType] = useState(null);
  const [addMode, setAddMode] = useState('new');
  const [newPersonForm, setNewPersonForm] = useState(null);
  const [selectedExistingPerson, setSelectedExistingPerson] = useState(null);
  const [existingPersonSearch, setExistingPersonSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Validation state
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);

  // Integration state
  const [codexEntry, setCodexEntry] = useState(null);
  const [loadingCodex, setLoadingCodex] = useState(false);
  const [personDignities, setPersonDignities] = useState([]);
  const [loadingDignities, setLoadingDignities] = useState(false);

  // Reset state when person changes
  useEffect(() => {
    setEditedPerson(person);
    setAddingRelationType(null);
    setAddMode('new');
    setNewPersonForm(null);
    setSelectedExistingPerson(null);
    setExistingPersonSearch('');

    if (person?.id) {
      loadCodexEntry(person.id);
      loadPersonDignities(person.id);
    } else {
      setCodexEntry(null);
      setPersonDignities([]);
    }
  }, [person]);

  const loadCodexEntry = async (personId) => {
    try {
      setLoadingCodex(true);
      const entry = await getEntryByPersonId(personId);
      setCodexEntry(entry);
    } catch (error) {
      console.warn('Could not load Codex entry:', error);
      setCodexEntry(null);
    } finally {
      setLoadingCodex(false);
    }
  };

  const loadPersonDignities = async (personId) => {
    try {
      setLoadingDignities(true);
      const dignities = await getDignitiesForPerson(personId);
      dignities.sort((a, b) => {
        if (b.displayPriority !== a.displayPriority) {
          return (b.displayPriority || 0) - (a.displayPriority || 0);
        }
        return (a.name || '').localeCompare(b.name || '');
      });
      setPersonDignities(dignities);
    } catch (error) {
      console.warn('Could not load dignities:', error);
      setPersonDignities([]);
    } finally {
      setLoadingDignities(false);
    }
  };

  // Computed relationships
  const house = useMemo(() =>
    houses.find(h => h.id === person?.houseId),
    [houses, person?.houseId]
  );

  const personRelationships = useMemo(() =>
    relationships.filter(rel =>
      rel.person1Id === person?.id || rel.person2Id === person?.id
    ),
    [relationships, person?.id]
  );

  const spouses = useMemo(() =>
    personRelationships
      .filter(rel => rel.relationshipType === 'spouse')
      .map(rel => {
        const spouseId = rel.person1Id === person?.id ? rel.person2Id : rel.person1Id;
        return people.find(p => p.id === spouseId);
      })
      .filter(Boolean),
    [personRelationships, person?.id, people]
  );

  const parents = useMemo(() =>
    personRelationships
      .filter(rel =>
        (rel.relationshipType === 'parent' || rel.relationshipType === 'adopted-parent') &&
        rel.person2Id === person?.id
      )
      .map(rel => ({
        person: people.find(p => p.id === rel.person1Id),
        type: rel.relationshipType
      }))
      .filter(item => item.person),
    [personRelationships, person?.id, people]
  );

  const children = useMemo(() =>
    personRelationships
      .filter(rel =>
        (rel.relationshipType === 'parent' || rel.relationshipType === 'adopted-parent') &&
        rel.person1Id === person?.id
      )
      .map(rel => ({
        person: people.find(p => p.id === rel.person2Id),
        type: rel.relationshipType
      }))
      .filter(item => item.person)
      .sort((a, b) => {
        const aYear = parseInt(a.person.dateOfBirth) || 0;
        const bYear = parseInt(b.person.dateOfBirth) || 0;
        return aYear - bYear;
      }),
    [personRelationships, person?.id, people]
  );

  const siblings = useMemo(() => {
    if (parents.length === 0) return [];

    const parentIds = parents.map(p => p.person.id);
    const siblingIds = new Set();

    relationships.forEach(rel => {
      if (rel.relationshipType === 'parent' || rel.relationshipType === 'adopted-parent') {
        if (parentIds.includes(rel.person1Id) && rel.person2Id !== person?.id) {
          siblingIds.add(rel.person2Id);
        }
      }
    });

    return Array.from(siblingIds)
      .map(id => people.find(p => p.id === id))
      .filter(Boolean)
      .sort((a, b) => {
        const aYear = parseInt(a.dateOfBirth) || 0;
        const bYear = parseInt(b.dateOfBirth) || 0;
        return aYear - bYear;
      });
  }, [parents, relationships, person?.id, people]);

  // Available people for linking
  const availableExistingPeople = useMemo(() => {
    if (!addingRelationType) return [];

    let candidates = people.filter(p => p.id !== person?.id);
    const existingRelatedIds = new Set();

    personRelationships.forEach(rel => {
      if (addingRelationType === 'spouse' && rel.relationshipType === 'spouse') {
        existingRelatedIds.add(rel.person1Id === person?.id ? rel.person2Id : rel.person1Id);
      }
      if (addingRelationType === 'parent' &&
          (rel.relationshipType === 'parent' || rel.relationshipType === 'adopted-parent') &&
          rel.person2Id === person?.id) {
        existingRelatedIds.add(rel.person1Id);
      }
      if (addingRelationType === 'child' &&
          (rel.relationshipType === 'parent' || rel.relationshipType === 'adopted-parent') &&
          rel.person1Id === person?.id) {
        existingRelatedIds.add(rel.person2Id);
      }
    });

    if (addingRelationType === 'sibling') {
      siblings.forEach(s => existingRelatedIds.add(s.id));
    }

    candidates = candidates.filter(p => !existingRelatedIds.has(p.id));

    if (existingPersonSearch.trim()) {
      const search = existingPersonSearch.toLowerCase().trim();
      candidates = candidates.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(search) ||
        p.firstName?.toLowerCase().includes(search) ||
        p.lastName?.toLowerCase().includes(search)
      );
    }

    candidates.sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return candidates;
  }, [addingRelationType, people, person?.id, personRelationships, siblings, existingPersonSearch]);

  // Handlers
  const handleSave = async () => {
    try {
      setSaving(true);
      await updatePerson(editedPerson.id, editedPerson);
    } catch (error) {
      alert('Error saving: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStartAddRelation = (type) => {
    setAddingRelationType(type);
    setAddMode('new');
    setSelectedExistingPerson(null);
    setExistingPersonSearch('');
    setNewPersonForm(getSmartDefaults(type));
  };

  const handleCancelAdd = () => {
    setAddingRelationType(null);
    setAddMode('new');
    setNewPersonForm(null);
    setSelectedExistingPerson(null);
    setExistingPersonSearch('');
    setValidationWarnings([]);
    setValidationErrors([]);
    setWarningsAcknowledged(false);
  };

  // Validation effects
  useEffect(() => {
    if (!newPersonForm || !addingRelationType || addMode !== 'new') {
      setValidationWarnings([]);
      setValidationErrors([]);
      return;
    }

    const tempPerson = {
      id: -1,
      firstName: newPersonForm.firstName?.trim() || 'New',
      lastName: newPersonForm.lastName?.trim() || person.lastName,
      dateOfBirth: newPersonForm.dateOfBirth || null,
      dateOfDeath: newPersonForm.dateOfDeath || null,
      gender: newPersonForm.gender,
      houseId: newPersonForm.houseId || person.houseId
    };

    let tempRelationship = null;

    if (addingRelationType === 'spouse') {
      tempRelationship = {
        person1Id: person.id,
        person2Id: -1,
        relationshipType: 'spouse',
        marriageStatus: 'married'
      };
    } else if (addingRelationType === 'parent') {
      tempRelationship = {
        person1Id: -1,
        person2Id: person.id,
        relationshipType: 'parent'
      };
    } else if (addingRelationType === 'child') {
      tempRelationship = {
        person1Id: person.id,
        person2Id: -1,
        relationshipType: newPersonForm.legitimacyStatus === 'adopted' ? 'adopted-parent' : 'parent'
      };
    }

    if (tempRelationship && newPersonForm.firstName?.trim()) {
      const allPeopleWithTemp = [...people, tempPerson];
      const result = validateRelationship(tempRelationship, allPeopleWithTemp, relationships);

      setValidationErrors(result.errors || []);
      setValidationWarnings(result.warnings || []);

      if (result.warnings?.length !== validationWarnings.length) {
        setWarningsAcknowledged(false);
      }
    } else {
      setValidationErrors([]);
      setValidationWarnings([]);
    }
  }, [newPersonForm, addingRelationType, addMode, person, people, relationships]);

  useEffect(() => {
    if (!selectedExistingPerson || !addingRelationType || addMode !== 'existing') {
      if (addMode === 'existing') {
        setValidationWarnings([]);
        setValidationErrors([]);
      }
      return;
    }

    let tempRelationship = null;

    if (addingRelationType === 'spouse') {
      tempRelationship = {
        person1Id: person.id,
        person2Id: selectedExistingPerson.id,
        relationshipType: 'spouse',
        marriageStatus: 'married'
      };
    } else if (addingRelationType === 'parent') {
      tempRelationship = {
        person1Id: selectedExistingPerson.id,
        person2Id: person.id,
        relationshipType: 'parent'
      };
    } else if (addingRelationType === 'child') {
      tempRelationship = {
        person1Id: person.id,
        person2Id: selectedExistingPerson.id,
        relationshipType: 'parent'
      };
    } else if (addingRelationType === 'sibling') {
      if (parents.length > 0) {
        tempRelationship = {
          person1Id: parents[0].person.id,
          person2Id: selectedExistingPerson.id,
          relationshipType: parents[0].type
        };
      }
    }

    if (tempRelationship) {
      const result = validateRelationship(tempRelationship, people, relationships);
      setValidationErrors(result.errors || []);
      setValidationWarnings(result.warnings || []);
      setWarningsAcknowledged(false);
    }
  }, [selectedExistingPerson, addingRelationType, addMode, person, people, relationships, parents]);

  const getSmartDefaults = (relationType) => {
    const currentYear = parseInt(person.dateOfBirth) || 1250;

    const base = {
      firstName: '',
      lastName: '',
      maidenName: '',
      gender: 'male',
      dateOfBirth: '',
      dateOfDeath: '',
      houseId: null,
      legitimacyStatus: 'legitimate',
      notes: ''
    };

    switch (relationType) {
      case 'spouse':
        return {
          ...base,
          gender: person.gender === 'male' ? 'female' : 'male',
          dateOfBirth: String(currentYear),
          houseId: null,
          lastName: ''
        };
      case 'parent':
        return {
          ...base,
          dateOfBirth: String(currentYear - 25),
          houseId: person.houseId,
          lastName: person.lastName
        };
      case 'child':
        return {
          ...base,
          dateOfBirth: String(currentYear + 25),
          houseId: person.houseId,
          lastName: person.lastName
        };
      case 'sibling':
        return {
          ...base,
          dateOfBirth: String(currentYear),
          houseId: person.houseId,
          lastName: person.lastName
        };
      default:
        return base;
    }
  };

  const handleSaveNewPerson = async () => {
    if (!newPersonForm.firstName.trim()) {
      alert('First name is required');
      return;
    }

    if (validationErrors.length > 0) {
      alert('Cannot save: ' + validationErrors[0].message);
      return;
    }

    if (validationWarnings.length > 0 && !warningsAcknowledged) {
      alert('Please acknowledge the warnings before saving');
      return;
    }

    try {
      setSaving(true);

      const newPersonId = await addPerson({
        firstName: newPersonForm.firstName.trim(),
        lastName: newPersonForm.lastName.trim() || person.lastName,
        maidenName: newPersonForm.maidenName.trim() || null,
        gender: newPersonForm.gender,
        dateOfBirth: newPersonForm.dateOfBirth || null,
        dateOfDeath: newPersonForm.dateOfDeath || null,
        houseId: newPersonForm.houseId || person.houseId,
        legitimacyStatus: newPersonForm.legitimacyStatus,
        notes: newPersonForm.notes || null
      });

      await createRelationshipForPerson(newPersonId);
      handleCancelAdd();

    } catch (error) {
      alert('Error adding person: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLinkExistingPerson = async () => {
    if (!selectedExistingPerson) {
      alert('Please select a person');
      return;
    }

    if (validationErrors.length > 0) {
      alert('Cannot link: ' + validationErrors[0].message);
      return;
    }

    if (validationWarnings.length > 0 && !warningsAcknowledged) {
      alert('Please acknowledge the warnings before saving');
      return;
    }

    try {
      setSaving(true);
      await createRelationshipForPerson(selectedExistingPerson.id);
      handleCancelAdd();
    } catch (error) {
      alert('Error linking person: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const createRelationshipForPerson = async (targetPersonId) => {
    switch (addingRelationType) {
      case 'spouse':
        await addRelationship({
          person1Id: person.id,
          person2Id: targetPersonId,
          relationshipType: 'spouse',
          marriageStatus: 'married',  // Default to married when creating via tree
          marriageDate: null,
          divorceDate: null
        });
        break;
      case 'parent':
        await addRelationship({
          person1Id: targetPersonId,
          person2Id: person.id,
          relationshipType: 'parent',
          biologicalParent: true  // Default to biological when adding parent via tree
        });
        break;
      case 'child': {
        // For new people, check if adopted via form; for existing people, default to biological
        const isAdopted = addMode === 'new' && newPersonForm?.legitimacyStatus === 'adopted';
        const relType = isAdopted ? 'adopted-parent' : 'parent';
        
        await addRelationship({
          person1Id: person.id,
          person2Id: targetPersonId,
          relationshipType: relType,
          // Only set biologicalParent for 'parent' type, not 'adopted-parent'
          biologicalParent: relType === 'parent' ? true : null
        });
        
        // If there's a co-parent selected (only available when creating new), create their relationship too
        if (addMode === 'new' && newPersonForm?.coParentId) {
          await addRelationship({
            person1Id: newPersonForm.coParentId,
            person2Id: targetPersonId,
            relationshipType: relType,
            biologicalParent: relType === 'parent' ? true : null
          });
        }
        break;
      }
      case 'sibling':
        // Create parent relationships to link siblings through shared parents
        for (const parentData of parents) {
          await addRelationship({
            person1Id: parentData.person.id,
            person2Id: targetPersonId,
            relationshipType: parentData.type,
            // Preserve the biological status from the existing parent relationship
            biologicalParent: parentData.type === 'parent' ? true : null
          });
        }
        break;
    }
  };

  const handlePersonClick = (clickedPerson) => {
    if (onPersonSelect) {
      onPersonSelect(clickedPerson);
    }
  };

  // Render helpers
  const renderPersonChip = (relatedPerson, subtitle = null) => (
    <motion.div
      key={relatedPerson.id}
      onClick={() => handlePersonClick(relatedPerson)}
      className="quick-edit__person-chip"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="quick-edit__person-chip-main">
        <span className="quick-edit__person-chip-name">
          {relatedPerson.firstName} {relatedPerson.lastName}
        </span>
        <Icon name="chevron-right" size={14} className="quick-edit__person-chip-arrow" />
      </div>
      {subtitle && (
        <span className="quick-edit__person-chip-subtitle">{subtitle}</span>
      )}
    </motion.div>
  );

  const renderAddButton = (label, relationType, disabled = false, disabledReason = '') => (
    <button
      onClick={() => handleStartAddRelation(relationType)}
      disabled={disabled}
      className={`quick-edit__add-btn ${disabled ? 'quick-edit__add-btn--disabled' : ''}`}
      title={disabled ? disabledReason : `Add ${label}`}
    >
      <Icon name="plus" size={14} />
      <span>Add {label}</span>
    </button>
  );

  if (!person) return null;

  const primaryEpithet = getPrimaryEpithet(person.epithets);
  const biographyStatus = getBiographyStatus(codexEntry, isDarkTheme);

  return (
    <>
      {/* Main Panel */}
      <motion.div
        className="quick-edit"
        variants={PANEL_VARIANTS}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/* Header */}
        <div className="quick-edit__header">
          <div className="quick-edit__header-content">
            <h2 className="quick-edit__title">
              {person.firstName} {person.lastName}
              {primaryEpithet && (
                <span className="quick-edit__epithet">{primaryEpithet.text}</span>
              )}
            </h2>
            {person.maidenName && (
              <p className="quick-edit__maiden-name">nee {person.maidenName}</p>
            )}
            <div className="quick-edit__badges">
              {house && (
                <span
                  className="quick-edit__badge quick-edit__badge--house"
                  style={{ backgroundColor: house.colorCode || 'var(--bg-tertiary)' }}
                >
                  {house.houseName}
                </span>
              )}
              <span className="quick-edit__badge quick-edit__badge--status">
                {person.legitimacyStatus || 'Legitimate'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="quick-edit__close" title="Close panel">
            <Icon name="x" size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="quick-edit__content">

          {/* Basic Information */}
          <motion.section
            className="quick-edit__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            <h3 className="quick-edit__section-title">
              <Icon name="clipboard-list" size={14} />
              <span>Basic Information</span>
            </h3>

            <div className="quick-edit__row">
              <div className="quick-edit__field">
                <label className="quick-edit__label">Born</label>
                <input
                  type="text"
                  value={editedPerson.dateOfBirth || ''}
                  onChange={(e) => setEditedPerson({ ...editedPerson, dateOfBirth: e.target.value })}
                  className="quick-edit__input"
                />
              </div>
              <div className="quick-edit__field">
                <label className="quick-edit__label">Died</label>
                <input
                  type="text"
                  value={editedPerson.dateOfDeath || ''}
                  onChange={(e) => setEditedPerson({ ...editedPerson, dateOfDeath: e.target.value })}
                  placeholder="Living"
                  className="quick-edit__input"
                />
              </div>
            </div>

            {house && (
              <div className="quick-edit__house-display">
                <span>{house.houseName}</span>
              </div>
            )}
          </motion.section>

          {/* House Heraldry */}
          {house && (
            <HouseHeraldrySection house={house} isDarkTheme={isDarkTheme} />
          )}

          {/* Personal Arms */}
          <PersonalArmsSection
            person={person}
            house={house}
            allPeople={people}
            allRelationships={relationships}
            isDarkTheme={isDarkTheme}
          />

          {/* Biography */}
          <motion.section
            className="quick-edit__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
          >
            <h3 className="quick-edit__section-title">
              <Icon name="book-open" size={14} />
              <span>Biography</span>
            </h3>

            {loadingCodex ? (
              <div className="quick-edit__loading">
                <Icon name="loader-2" size={16} className="spin" />
                <span>Loading...</span>
              </div>
            ) : (
              <div className="quick-edit__biography">
                <div
                  className={`quick-edit__biography-status quick-edit__biography-status--${biographyStatus.key}`}
                >
                  <Icon name={
                    biographyStatus.key === 'complete' ? 'check-circle' :
                    biographyStatus.key === 'detailed' ? 'file-text' :
                    biographyStatus.key === 'basic' ? 'file' :
                    biographyStatus.key === 'stub' ? 'file-minus' :
                    'file-question'
                  } size={18} className="quick-edit__biography-icon" />
                  <div className="quick-edit__biography-info">
                    <span className="quick-edit__biography-label">{biographyStatus.label}</span>
                    <span className="quick-edit__biography-summary">
                      {getStatusSummary(codexEntry, isDarkTheme)}
                    </span>
                  </div>
                  {(biographyStatus.key === 'empty' || biographyStatus.key === 'stub') && (
                    <span className="quick-edit__biography-attention">Needs attention</span>
                  )}
                </div>

                <div className="quick-edit__biography-actions">
                  {codexEntry ? (
                    <>
                      <ActionButton
                        icon="book-open"
                        onClick={() => navigate(`/codex/entry/${codexEntry.id}`)}
                        variant="secondary"
                        size="sm"
                      >
                        View Biography
                      </ActionButton>
                      <ActionButton
                        icon="pencil"
                        onClick={() => navigate(`/codex/edit/${codexEntry.id}`)}
                        variant="ghost"
                        size="sm"
                        title="Edit biography"
                      />
                    </>
                  ) : (
                    <div className="quick-edit__biography-empty">
                      No Codex entry linked
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.section>

          {/* Titles & Dignities */}
          <motion.section
            className="quick-edit__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.15 }}
          >
            <h3 className="quick-edit__section-title">
              <Icon name="crown" size={14} />
              <span>Titles & Dignities</span>
              <span className="quick-edit__section-count">({personDignities.length})</span>
            </h3>

            {loadingDignities ? (
              <div className="quick-edit__loading">
                <Icon name="loader-2" size={16} className="spin" />
                <span>Loading...</span>
              </div>
            ) : personDignities.length > 0 ? (
              <div className="quick-edit__dignities">
                {personDignities.map(dignity => (
                  <motion.div
                    key={dignity.id}
                    onClick={() => navigate(`/dignities/view/${dignity.id}`)}
                    className="quick-edit__dignity"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="quick-edit__dignity-main">
                      <span className="quick-edit__dignity-icon">
                        {getDignityIcon(dignity) || DIGNITY_CLASSES[dignity.dignityClass]?.icon || ''}
                      </span>
                      <span className="quick-edit__dignity-name">
                        {dignity.shortName || dignity.name}
                      </span>
                      <Icon name="chevron-right" size={14} className="quick-edit__dignity-arrow" />
                    </div>
                    {dignity.name !== dignity.shortName && dignity.shortName && (
                      <span className="quick-edit__dignity-full">{dignity.name}</span>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="quick-edit__empty-state">No titles recorded</div>
            )}

            <button
              onClick={() => navigate(`/dignities/create?personId=${person.id}&houseId=${person.houseId || ''}`)}
              className="quick-edit__add-btn"
            >
              <Icon name="plus" size={14} />
              <span>Add Title</span>
            </button>
          </motion.section>

          {/* Epithets */}
          <motion.section
            className="quick-edit__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
          >
            <h3 className="quick-edit__section-title">
              <Icon name="sparkles" size={14} />
              <span>Epithets</span>
              <span className="quick-edit__section-count">({(editedPerson.epithets || []).length})</span>
            </h3>

            <EpithetsSection
              epithets={editedPerson.epithets || []}
              onChange={(newEpithets) => setEditedPerson({ ...editedPerson, epithets: newEpithets })}
              isDarkTheme={isDarkTheme}
              compact={true}
            />
          </motion.section>

          {/* Spouses */}
          <motion.section
            className="quick-edit__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.25 }}
          >
            <h3 className="quick-edit__section-title">
              <Icon name="heart" size={14} />
              <span>Spouse{spouses.length !== 1 ? 's' : ''}</span>
              <span className="quick-edit__section-count">({spouses.length})</span>
            </h3>

            <div className="quick-edit__persons">
              {spouses.map(spouse => renderPersonChip(spouse))}
            </div>
            {renderAddButton('Spouse', 'spouse')}
          </motion.section>

          {/* Parents */}
          <motion.section
            className="quick-edit__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
          >
            <h3 className="quick-edit__section-title">
              <Icon name="crown" size={14} />
              <span>Parents</span>
              <span className="quick-edit__section-count">({parents.length})</span>
            </h3>

            <div className="quick-edit__persons">
              {parents.map(({ person: parent, type }) =>
                renderPersonChip(parent, type === 'adopted-parent' ? 'Adoptive' : null)
              )}
            </div>
            {parents.length < 2 ? (
              renderAddButton('Parent', 'parent')
            ) : (
              <div className="quick-edit__max-reached">Maximum 2 parents reached</div>
            )}
          </motion.section>

          {/* Siblings */}
          <motion.section
            className="quick-edit__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.35 }}
          >
            <h3 className="quick-edit__section-title">
              <Icon name="users" size={14} />
              <span>Siblings</span>
              <span className="quick-edit__section-count">({siblings.length})</span>
            </h3>

            {siblings.length > 0 && (
              <div className="quick-edit__persons quick-edit__persons--scrollable">
                {siblings.map(sibling => renderPersonChip(sibling))}
              </div>
            )}
            {parents.length > 0 ? (
              renderAddButton('Sibling', 'sibling')
            ) : (
              renderAddButton('Sibling', 'sibling', true, 'Add at least one parent first to add siblings')
            )}
          </motion.section>

          {/* Children */}
          <motion.section
            className="quick-edit__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
          >
            <h3 className="quick-edit__section-title">
              <Icon name="baby" size={14} />
              <span>Children</span>
              <span className="quick-edit__section-count">({children.length})</span>
            </h3>

            {children.length > 0 && (
              <div className="quick-edit__persons quick-edit__persons--scrollable">
                {children.map(({ person: child, type }) =>
                  renderPersonChip(child, type === 'adopted-parent' ? 'Adopted' : null)
                )}
              </div>
            )}
            {renderAddButton('Child', 'child')}
          </motion.section>

        </div>

        {/* Footer */}
        <div className="quick-edit__footer">
          <ActionButton
            icon="save"
            onClick={handleSave}
            disabled={saving}
            variant="primary"
            fullWidth
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </ActionButton>
        </div>
      </motion.div>

      {/* Add Person Modal */}
      <AnimatePresence>
        {addingRelationType && (
          <div className="quick-edit-modal__overlay" onClick={handleCancelAdd}>
            <motion.div
              className="quick-edit-modal"
              variants={MODAL_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="quick-edit-modal__header">
                <div className="quick-edit-modal__header-content">
                  <h3 className="quick-edit-modal__title">
                    <Icon name={RELATION_CONFIG[addingRelationType].icon} size={18} />
                    <span>Add {RELATION_CONFIG[addingRelationType].label}</span>
                  </h3>
                  <p className="quick-edit-modal__subtitle">
                    Adding {RELATION_CONFIG[addingRelationType].description} {person.firstName}
                  </p>
                </div>
                <button onClick={handleCancelAdd} className="quick-edit-modal__close">
                  <Icon name="x" size={20} />
                </button>
              </div>

              {/* Mode Toggle */}
              <div className="quick-edit-modal__mode-toggle">
                <button
                  onClick={() => {
                    setAddMode('new');
                    setSelectedExistingPerson(null);
                    if (!newPersonForm) {
                      setNewPersonForm(getSmartDefaults(addingRelationType));
                    }
                  }}
                  className={`quick-edit-modal__mode-btn ${addMode === 'new' ? 'quick-edit-modal__mode-btn--active' : ''}`}
                >
                  <Icon name="sparkles" size={14} />
                  <span>Create New</span>
                </button>
                <button
                  onClick={() => {
                    setAddMode('existing');
                    setExistingPersonSearch('');
                  }}
                  className={`quick-edit-modal__mode-btn ${addMode === 'existing' ? 'quick-edit-modal__mode-btn--active' : ''}`}
                >
                  <Icon name="link" size={14} />
                  <span>Link Existing</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="quick-edit-modal__body">
                {addMode === 'new' ? (
                  // New Person Form
                  newPersonForm && (
                    <div className="quick-edit-modal__form">
                      <div className="quick-edit-modal__row">
                        <div className="quick-edit-modal__field">
                          <label className="quick-edit-modal__label">First Name *</label>
                          <input
                            type="text"
                            value={newPersonForm.firstName}
                            onChange={(e) => setNewPersonForm({ ...newPersonForm, firstName: e.target.value })}
                            className="quick-edit-modal__input"
                            autoFocus
                          />
                        </div>
                        <div className="quick-edit-modal__field">
                          <label className="quick-edit-modal__label">Last Name</label>
                          <input
                            type="text"
                            value={newPersonForm.lastName}
                            onChange={(e) => setNewPersonForm({ ...newPersonForm, lastName: e.target.value })}
                            placeholder={person.lastName}
                            className="quick-edit-modal__input"
                          />
                        </div>
                      </div>

                      {addingRelationType === 'spouse' && newPersonForm.gender === 'female' && (
                        <div className="quick-edit-modal__field">
                          <label className="quick-edit-modal__label">Maiden Name</label>
                          <input
                            type="text"
                            value={newPersonForm.maidenName}
                            onChange={(e) => setNewPersonForm({ ...newPersonForm, maidenName: e.target.value })}
                            placeholder="Birth surname if different"
                            className="quick-edit-modal__input"
                          />
                        </div>
                      )}

                      <div className="quick-edit-modal__row">
                        <div className="quick-edit-modal__field">
                          <label className="quick-edit-modal__label">Gender</label>
                          <select
                            value={newPersonForm.gender}
                            onChange={(e) => setNewPersonForm({ ...newPersonForm, gender: e.target.value })}
                            className="quick-edit-modal__select"
                          >
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div className="quick-edit-modal__field">
                          <label className="quick-edit-modal__label">Birth Year</label>
                          <input
                            type="text"
                            value={newPersonForm.dateOfBirth}
                            onChange={(e) => setNewPersonForm({ ...newPersonForm, dateOfBirth: e.target.value })}
                            placeholder="e.g. 1250"
                            className="quick-edit-modal__input"
                          />
                        </div>
                      </div>

                      <div className="quick-edit-modal__field">
                        <label className="quick-edit-modal__label">
                          Death Year <span className="quick-edit-modal__label-hint">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={newPersonForm.dateOfDeath}
                          onChange={(e) => setNewPersonForm({ ...newPersonForm, dateOfDeath: e.target.value })}
                          placeholder="Leave blank if living"
                          className="quick-edit-modal__input"
                        />
                      </div>

                      <div className="quick-edit-modal__field">
                        <label className="quick-edit-modal__label">House</label>
                        <select
                          value={newPersonForm.houseId || ''}
                          onChange={(e) => setNewPersonForm({
                            ...newPersonForm,
                            houseId: e.target.value ? Number(e.target.value) : null
                          })}
                          className="quick-edit-modal__select"
                        >
                          <option value="">-- Select House --</option>
                          {houses.map(h => (
                            <option key={h.id} value={h.id}>
                              {h.houseName} {h.id === person.houseId ? '(same)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="quick-edit-modal__field">
                        <label className="quick-edit-modal__label">Status</label>
                        <select
                          value={newPersonForm.legitimacyStatus}
                          onChange={(e) => setNewPersonForm({ ...newPersonForm, legitimacyStatus: e.target.value })}
                          className="quick-edit-modal__select"
                        >
                          <option value="legitimate">Legitimate</option>
                          <option value="bastard">Bastard</option>
                          <option value="adopted">Adopted</option>
                          <option value="commoner">Commoner</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </div>

                      {addingRelationType === 'child' && spouses.length > 0 && (
                        <div className="quick-edit-modal__field">
                          <label className="quick-edit-modal__label">Other Parent</label>
                          <select
                            value={newPersonForm.coParentId || ''}
                            onChange={(e) => setNewPersonForm({
                              ...newPersonForm,
                              coParentId: e.target.value ? Number(e.target.value) : null
                            })}
                            className="quick-edit-modal__select"
                          >
                            <option value="">-- No other parent / Unknown --</option>
                            {spouses.map(spouse => (
                              <option key={spouse.id} value={spouse.id}>
                                {spouse.firstName} {spouse.lastName}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  // Existing Person Selector
                  <div className="quick-edit-modal__selector">
                    <div className="quick-edit-modal__field">
                      <label className="quick-edit-modal__label">Search by name</label>
                      <input
                        type="text"
                        value={existingPersonSearch}
                        onChange={(e) => setExistingPersonSearch(e.target.value)}
                        placeholder="Type to search..."
                        className="quick-edit-modal__input"
                        autoFocus
                      />
                    </div>

                    {selectedExistingPerson && (
                      <div className="quick-edit-modal__selected">
                        <div className="quick-edit-modal__selected-info">
                          <span className="quick-edit-modal__selected-name">
                            {selectedExistingPerson.firstName} {selectedExistingPerson.lastName}
                          </span>
                          <span className="quick-edit-modal__selected-details">
                            {selectedExistingPerson.dateOfBirth && `b. ${selectedExistingPerson.dateOfBirth.split('-')[0]}`}
                            {selectedExistingPerson.dateOfDeath && ` - d. ${selectedExistingPerson.dateOfDeath.split('-')[0]}`}
                            {(() => {
                              const h = houses.find(ho => ho.id === selectedExistingPerson.houseId);
                              return h ? ` - ${h.houseName}` : '';
                            })()}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedExistingPerson(null)}
                          className="quick-edit-modal__selected-clear"
                        >
                          <Icon name="x" size={14} />
                          <span>Clear</span>
                        </button>
                      </div>
                    )}

                    <div className="quick-edit-modal__field">
                      <label className="quick-edit-modal__label">
                        {selectedExistingPerson ? 'Or select another person' : 'Select a person'}
                        <span className="quick-edit-modal__label-hint"> ({availableExistingPeople.length} available)</span>
                      </label>
                      <div className="quick-edit-modal__person-list">
                        {availableExistingPeople.length === 0 ? (
                          <div className="quick-edit-modal__no-results">
                            {existingPersonSearch ? 'No matching people found' : 'No available people to link'}
                          </div>
                        ) : (
                          availableExistingPeople.map(p => (
                            <div
                              key={p.id}
                              onClick={() => setSelectedExistingPerson(p)}
                              className={`quick-edit-modal__person-item ${selectedExistingPerson?.id === p.id ? 'quick-edit-modal__person-item--selected' : ''}`}
                            >
                              <span className="quick-edit-modal__person-name">
                                {p.firstName} {p.lastName}
                              </span>
                              <span className="quick-edit-modal__person-details">
                                {p.dateOfBirth && `b. ${p.dateOfBirth.split('-')[0]}`}
                                {p.dateOfDeath && ` - d. ${p.dateOfDeath.split('-')[0]}`}
                                {(() => {
                                  const h = houses.find(ho => ho.id === p.houseId);
                                  return h ? ` - ${h.houseName}` : '';
                                })()}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation Feedback */}
                {validationErrors.length > 0 && (
                  <div className="quick-edit-modal__alert quick-edit-modal__alert--error">
                    <Icon name="x-circle" size={18} className="quick-edit-modal__alert-icon" />
                    <div className="quick-edit-modal__alert-content">
                      <span className="quick-edit-modal__alert-title">Cannot Create Relationship</span>
                      <ul className="quick-edit-modal__alert-list">
                        {validationErrors.map((err, idx) => (
                          <li key={idx}>{err.message}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {validationWarnings.length > 0 && validationErrors.length === 0 && (
                  <div className="quick-edit-modal__alert quick-edit-modal__alert--warning">
                    <Icon name="alert-triangle" size={18} className="quick-edit-modal__alert-icon" />
                    <div className="quick-edit-modal__alert-content">
                      <span className="quick-edit-modal__alert-title">Potential Issues</span>
                      <ul className="quick-edit-modal__alert-list">
                        {validationWarnings.map((warn, idx) => (
                          <li key={idx}>{warn.message}</li>
                        ))}
                      </ul>
                      <label className="quick-edit-modal__checkbox">
                        <input
                          type="checkbox"
                          checked={warningsAcknowledged}
                          onChange={(e) => setWarningsAcknowledged(e.target.checked)}
                        />
                        <span>I understand and want to proceed</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="quick-edit-modal__footer">
                <ActionButton
                  type="button"
                  onClick={handleCancelAdd}
                  variant="ghost"
                >
                  Cancel
                </ActionButton>
                {addMode === 'new' ? (
                  <ActionButton
                    icon="check"
                    onClick={handleSaveNewPerson}
                    disabled={
                      saving ||
                      !newPersonForm?.firstName?.trim() ||
                      validationErrors.length > 0 ||
                      (validationWarnings.length > 0 && !warningsAcknowledged)
                    }
                    variant="primary"
                  >
                    {saving ? 'Saving...' : 'Create & Link'}
                  </ActionButton>
                ) : (
                  <ActionButton
                    icon="link"
                    onClick={handleLinkExistingPerson}
                    disabled={
                      saving ||
                      !selectedExistingPerson ||
                      validationErrors.length > 0 ||
                      (validationWarnings.length > 0 && !warningsAcknowledged)
                    }
                    variant="primary"
                  >
                    {saving ? 'Linking...' : `Link ${RELATION_CONFIG[addingRelationType].label}`}
                  </ActionButton>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default QuickEditPanel;
