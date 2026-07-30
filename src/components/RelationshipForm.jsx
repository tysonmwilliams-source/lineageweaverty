/**
 * RelationshipForm.jsx - Relationship Creation/Editing Form
 *
 * A form for creating or editing relationships between people.
 * Features smart validation that catches biological impossibilities
 * and suggests helpful cascading updates.
 *
 * RELATIONSHIP TYPES:
 * - parent: Parent/Child
 * - spouse: Marriage
 * - adopted-parent: Adopted Parent/Child
 * - foster-parent: Foster Parent/Child
 * - mentor: Mentor/Apprentice
 * - twin: Twins
 * - named-after: Namesake
 * - lineage-gap: Distant Ancestor
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateRelationship, generateCascadeSuggestions } from '../utils/SmartDataValidator';
import Icon from './icons/Icon';
import ActionButton from './shared/ActionButton';
import './RelationshipForm.css';
import { isOutOfOrder } from '../utils/parseYear';

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 }
  }
};

const ALERT_VARIANTS = {
  hidden: { opacity: 0, height: 0, marginBottom: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    marginBottom: 'var(--space-4)',
    transition: { duration: 0.3 }
  },
  exit: {
    opacity: 0,
    height: 0,
    marginBottom: 0,
    transition: { duration: 0.2 }
  }
};

const RELATIONSHIP_TYPE_CONFIG = {
  parent: {
    icon: 'users',
    label: 'Parent/Child',
    person1Label: 'Parent',
    person2Label: 'Child',
    description: 'Person 1 is the parent of Person 2'
  },
  spouse: {
    icon: 'heart',
    label: 'Spouse/Marriage',
    person1Label: 'First Person',
    person2Label: 'Second Person',
    description: 'Person 1 and Person 2 are married'
  },
  'adopted-parent': {
    icon: 'home',
    label: 'Adopted Parent/Child',
    person1Label: 'Adoptive Parent',
    person2Label: 'Adopted Child',
    description: 'Person 1 adopted Person 2'
  },
  'foster-parent': {
    icon: 'hand-heart',
    label: 'Foster Parent/Child',
    person1Label: 'Foster Parent',
    person2Label: 'Foster Child',
    description: 'Person 1 is foster parent of Person 2'
  },
  mentor: {
    icon: 'graduation-cap',
    label: 'Mentor/Apprentice',
    person1Label: 'Mentor',
    person2Label: 'Apprentice',
    description: 'Person 1 is mentor to Person 2'
  },
  twin: {
    icon: 'copy',
    label: 'Twins',
    person1Label: 'First Twin',
    person2Label: 'Second Twin',
    description: 'Person 1 and Person 2 are twins'
  },
  'named-after': {
    icon: 'bookmark',
    label: 'Named After (Namesake)',
    person1Label: 'Person Named',
    person2Label: 'Named After (Honored)',
    description: 'Person 1 was named after Person 2 (honors/namesake)'
  },
  'lineage-gap': {
    icon: 'link',
    label: 'Lineage Gap (Distant Ancestor)',
    person1Label: 'Descendant',
    person2Label: 'Distant Ancestor',
    description: 'Person 2 is a distant ancestor of Person 1 (exact lineage unknown)'
  }
};

function RelationshipForm({
  relationship = null,
  people = [],
  allRelationships = [],
  onSave,
  onCancel,
  onSuggestionAccept = null
}) {
  // Form state
  const [formData, setFormData] = useState({
    person1Id: relationship?.person1Id || '',
    person2Id: relationship?.person2Id || '',
    relationshipType: relationship?.relationshipType || 'parent',
    biologicalParent: relationship?.biologicalParent ?? true,
    betrothalDate: relationship?.betrothalDate || '',
    marriageDate: relationship?.marriageDate || '',
    divorceDate: relationship?.divorceDate || '',
    marriageStatus: relationship?.marriageStatus || 'married',
    estimatedGenerations: relationship?.estimatedGenerations || '',
    lineageNotes: relationship?.lineageNotes || ''
  });

  // Validation state
  const [errors, setErrors] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    setWarningsAcknowledged(false);
  };

  const getPersonName = (personId) => {
    const person = people.find(p => p.id === parseInt(personId));
    return person ? `${person.firstName} ${person.lastName}` : 'Unknown';
  };

  // Smart validation effect
  useEffect(() => {
    if (!formData.person1Id || !formData.person2Id) {
      setWarnings([]);
      setSuggestions([]);
      return;
    }

    const relationshipToValidate = {
      ...formData,
      person1Id: parseInt(formData.person1Id),
      person2Id: parseInt(formData.person2Id),
      id: relationship?.id
    };

    const validationResult = validateRelationship(
      relationshipToValidate,
      people,
      allRelationships
    );

    setWarnings(validationResult.warnings || []);

    if (!relationship) {
      const newSuggestions = generateCascadeSuggestions(
        'relationship_add',
        relationshipToValidate,
        { people, relationships: allRelationships }
      );
      setSuggestions(newSuggestions);
    }
  }, [formData, people, allRelationships, relationship]);

  const validate = () => {
    const newErrors = {};

    if (!formData.person1Id) {
      newErrors.person1Id = 'Please select the first person';
    }
    if (!formData.person2Id) {
      newErrors.person2Id = 'Please select the second person';
    }

    if (formData.person1Id && formData.person2Id &&
        formData.person1Id === formData.person2Id) {
      newErrors.person2Id = 'Cannot create relationship with the same person';
    }

    if (formData.relationshipType === 'spouse') {
      const dateRegex = /^\d{4}(-\d{2}(-\d{2})?)?$/;

      if (formData.betrothalDate && !dateRegex.test(formData.betrothalDate)) {
        newErrors.betrothalDate = 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD';
      }
      if (formData.marriageDate && !dateRegex.test(formData.marriageDate)) {
        newErrors.marriageDate = 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD';
      }
      if (formData.divorceDate && !dateRegex.test(formData.divorceDate)) {
        newErrors.divorceDate = 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD';
      }

      // Numeric comparison — see parseYear; string compare breaks on 3-digit years.
      if (isOutOfOrder(formData.marriageDate, formData.divorceDate)) {
        newErrors.divorceDate = 'Divorce date cannot be before marriage date';
      }
    }

    // Smart validation errors
    if (formData.person1Id && formData.person2Id) {
      const relationshipToValidate = {
        ...formData,
        person1Id: parseInt(formData.person1Id),
        person2Id: parseInt(formData.person2Id),
        id: relationship?.id
      };

      const smartResult = validateRelationship(
        relationshipToValidate,
        people,
        allRelationships
      );

      smartResult.errors.forEach(err => {
        switch (err.code) {
          case 'CIRCULAR_ANCESTRY':
          case 'PARENT_BORN_AFTER_CHILD':
          case 'PARENT_DEAD_AT_BIRTH':
            newErrors.person1Id = err.message;
            break;
          case 'DUPLICATE_RELATIONSHIP':
            newErrors.relationshipType = err.message;
            break;
          case 'MARRIED_AFTER_DEATH':
            newErrors.marriageDate = err.message;
            break;
          case 'DIVORCE_BEFORE_MARRIAGE':
            newErrors.divorceDate = err.message;
            break;
          default:
            newErrors.general = err.message;
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (warnings.length > 0 && !warningsAcknowledged) {
      return;
    }

    if (validate()) {
      const relationshipData = {
        person1Id: parseInt(formData.person1Id),
        person2Id: parseInt(formData.person2Id),
        relationshipType: formData.relationshipType,
        biologicalParent: formData.relationshipType === 'parent' ? formData.biologicalParent : null,
        betrothalDate: formData.relationshipType === 'spouse' && formData.betrothalDate
          ? formData.betrothalDate : null,
        marriageDate: formData.relationshipType === 'spouse' && formData.marriageDate
          ? formData.marriageDate : null,
        divorceDate: formData.relationshipType === 'spouse' && formData.divorceDate
          ? formData.divorceDate : null,
        marriageStatus: formData.relationshipType === 'spouse'
          ? formData.marriageStatus : null,
        estimatedGenerations: formData.relationshipType === 'lineage-gap' && formData.estimatedGenerations
          ? parseInt(formData.estimatedGenerations) : null,
        lineageNotes: formData.relationshipType === 'lineage-gap' && formData.lineageNotes
          ? formData.lineageNotes : null
      };

      if (relationship?.id) {
        relationshipData.id = relationship.id;
      }

      onSave(relationshipData);
    }
  };

  const handleAcceptSuggestion = (suggestion) => {
    if (onSuggestionAccept) {
      onSuggestionAccept(suggestion);
    }
    setSuggestions(prev => prev.filter(s => s !== suggestion));
  };

  const currentConfig = RELATIONSHIP_TYPE_CONFIG[formData.relationshipType];

  return (
    <form className="relationship-form" onSubmit={handleSubmit}>
      {/* Relationship Type Section */}
      <motion.div
        className="relationship-form__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <h3 className="relationship-form__section-title">
          <Icon name="link-2" size={16} />
          <span>Relationship Type</span>
        </h3>

        <div className="relationship-form__group">
          <label htmlFor="relationshipType" className="relationship-form__label">
            Type
          </label>
          <select
            id="relationshipType"
            name="relationshipType"
            value={formData.relationshipType}
            onChange={handleChange}
            className="relationship-form__select"
          >
            {Object.entries(RELATIONSHIP_TYPE_CONFIG).map(([value, config]) => (
              <option key={value} value={value}>
                {config.label}
              </option>
            ))}
          </select>
          <span className="relationship-form__hint">
            <Icon name={currentConfig.icon} size={12} />
            {currentConfig.description}
          </span>
          {errors.relationshipType && (
            <span className="relationship-form__error">
              <Icon name="alert-circle" size={12} />
              {errors.relationshipType}
            </span>
          )}
        </div>
      </motion.div>

      {/* Person Selection Section */}
      <motion.div
        className="relationship-form__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.1 }}
      >
        <h3 className="relationship-form__section-title">
          <Icon name="users" size={16} />
          <span>People</span>
        </h3>

        <div className="relationship-form__row">
          {/* Person 1 */}
          <div className="relationship-form__group">
            <label htmlFor="person1Id" className="relationship-form__label relationship-form__label--required">
              {currentConfig.person1Label}
            </label>
            <select
              id="person1Id"
              name="person1Id"
              value={formData.person1Id}
              onChange={handleChange}
              className={`relationship-form__select ${errors.person1Id ? 'relationship-form__select--error' : ''}`}
            >
              <option value="">Select person</option>
              {people.map(person => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                  {person.dateOfBirth ? ` (b. ${person.dateOfBirth.split('-')[0]})` : ''}
                </option>
              ))}
            </select>
            {errors.person1Id && (
              <span className="relationship-form__error">
                <Icon name="alert-circle" size={12} />
                {errors.person1Id}
              </span>
            )}
          </div>

          {/* Person 2 */}
          <div className="relationship-form__group">
            <label htmlFor="person2Id" className="relationship-form__label relationship-form__label--required">
              {currentConfig.person2Label}
            </label>
            <select
              id="person2Id"
              name="person2Id"
              value={formData.person2Id}
              onChange={handleChange}
              className={`relationship-form__select ${errors.person2Id ? 'relationship-form__select--error' : ''}`}
            >
              <option value="">Select person</option>
              {people.map(person => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                  {person.dateOfBirth ? ` (b. ${person.dateOfBirth.split('-')[0]})` : ''}
                </option>
              ))}
            </select>
            {errors.person2Id && (
              <span className="relationship-form__error">
                <Icon name="alert-circle" size={12} />
                {errors.person2Id}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Smart Validation Warnings */}
      <AnimatePresence>
        {warnings.length > 0 && (
          <motion.div
            className="relationship-form__alert relationship-form__alert--warning"
            variants={ALERT_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Icon name="alert-triangle" size={20} className="relationship-form__alert-icon" />
            <div className="relationship-form__alert-content">
              <h4 className="relationship-form__alert-title">Potential Issues Detected</h4>
              <ul className="relationship-form__alert-list">
                {warnings.map((warning, index) => (
                  <li key={index}>{warning.message}</li>
                ))}
              </ul>

              {!warningsAcknowledged && (
                <div className="relationship-form__alert-action">
                  <label className="relationship-form__checkbox">
                    <input
                      type="checkbox"
                      checked={warningsAcknowledged}
                      onChange={(e) => setWarningsAcknowledged(e.target.checked)}
                    />
                    <span>I understand these warnings and want to proceed anyway</span>
                  </label>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cascade Suggestions */}
      <AnimatePresence>
        {suggestions.length > 0 && onSuggestionAccept && (
          <motion.div
            className="relationship-form__alert relationship-form__alert--info"
            variants={ALERT_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Icon name="lightbulb" size={20} className="relationship-form__alert-icon" />
            <div className="relationship-form__alert-content">
              <h4 className="relationship-form__alert-title">Suggestions</h4>
              <div className="relationship-form__suggestions">
                {suggestions.map((suggestion, index) => (
                  <div key={index} className="relationship-form__suggestion">
                    <span className="relationship-form__suggestion-text">
                      {suggestion.message}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAcceptSuggestion(suggestion)}
                      className="relationship-form__suggestion-btn"
                    >
                      Yes
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* General Errors */}
      <AnimatePresence>
        {errors.general && (
          <motion.div
            className="relationship-form__alert relationship-form__alert--error"
            variants={ALERT_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Icon name="x-circle" size={20} className="relationship-form__alert-icon" />
            <div className="relationship-form__alert-content">
              <p className="relationship-form__alert-text">{errors.general}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Parent-specific fields */}
      <AnimatePresence>
        {formData.relationshipType === 'parent' && (
          <motion.div
            className="relationship-form__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ delay: 0.2 }}
          >
            <h3 className="relationship-form__section-title">
              <Icon name="dna" size={16} />
              <span>Parent Details</span>
            </h3>

            <div className="relationship-form__group">
              <label className="relationship-form__checkbox">
                <input
                  type="checkbox"
                  name="biologicalParent"
                  checked={formData.biologicalParent}
                  onChange={handleChange}
                />
                <span>Biological parent</span>
              </label>
              <span className="relationship-form__hint">
                Uncheck if this is a non-biological parental relationship
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lineage-gap specific fields */}
      <AnimatePresence>
        {formData.relationshipType === 'lineage-gap' && (
          <motion.div
            className="relationship-form__section relationship-form__section--lineage"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ delay: 0.2 }}
          >
            <h3 className="relationship-form__section-title">
              <Icon name="git-branch" size={16} />
              <span>Lineage Gap Details</span>
            </h3>

            <div className="relationship-form__info-box">
              <Icon name="info" size={16} className="relationship-form__info-icon" />
              <p className="relationship-form__info-text">
                Use this to connect family members who are related but separated by
                unknown or unrecorded generations. This creates a "loose" connection
                that links tree fragments without implying direct parent-child relationships.
              </p>
            </div>

            <div className="relationship-form__group">
              <label htmlFor="estimatedGenerations" className="relationship-form__label">
                Estimated Generations Apart
              </label>
              <input
                type="number"
                id="estimatedGenerations"
                name="estimatedGenerations"
                value={formData.estimatedGenerations}
                onChange={handleChange}
                min="1"
                max="50"
                className="relationship-form__input"
                placeholder="e.g., 5 for great-great-great grandparent"
              />
              <span className="relationship-form__hint">
                Approximate number of generations between these people (optional)
              </span>
            </div>

            <div className="relationship-form__group">
              <label htmlFor="lineageNotes" className="relationship-form__label">
                Connection Notes
              </label>
              <textarea
                id="lineageNotes"
                name="lineageNotes"
                value={formData.lineageNotes}
                onChange={handleChange}
                rows="3"
                className="relationship-form__textarea"
                placeholder="e.g., 'Aldric is believed to be Cair's ancestor through the main Salomon line, exact connection unknown'"
              />
              <span className="relationship-form__hint">
                Notes about how these people are connected or why the exact lineage is unknown
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spouse-specific fields */}
      <AnimatePresence>
        {formData.relationshipType === 'spouse' && (
          <motion.div
            className="relationship-form__section relationship-form__section--marriage"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ delay: 0.2 }}
          >
            <h3 className="relationship-form__section-title">
              <Icon name="heart" size={16} />
              <span>Marriage Details</span>
            </h3>

            <div className="relationship-form__row">
              {/* Marriage Date */}
              <div className="relationship-form__group">
                <label htmlFor="marriageDate" className="relationship-form__label">
                  Marriage Date
                </label>
                <input
                  type="text"
                  id="marriageDate"
                  name="marriageDate"
                  value={formData.marriageDate}
                  onChange={handleChange}
                  className={`relationship-form__input ${errors.marriageDate ? 'relationship-form__input--error' : ''}`}
                  placeholder="YYYY-MM-DD or YYYY"
                />
                {errors.marriageDate ? (
                  <span className="relationship-form__error">
                    <Icon name="alert-circle" size={12} />
                    {errors.marriageDate}
                  </span>
                ) : (
                  <span className="relationship-form__hint">
                    Format: YYYY-MM-DD, YYYY-MM, or YYYY
                  </span>
                )}
              </div>

              {/* Divorce Date */}
              <div className="relationship-form__group">
                <label htmlFor="divorceDate" className="relationship-form__label">
                  Divorce Date
                </label>
                <input
                  type="text"
                  id="divorceDate"
                  name="divorceDate"
                  value={formData.divorceDate}
                  onChange={handleChange}
                  className={`relationship-form__input ${errors.divorceDate ? 'relationship-form__input--error' : ''}`}
                  placeholder="Leave blank if still married"
                />
                {errors.divorceDate ? (
                  <span className="relationship-form__error">
                    <Icon name="alert-circle" size={12} />
                    {errors.divorceDate}
                  </span>
                ) : (
                  <span className="relationship-form__hint">
                    Leave blank if still married
                  </span>
                )}
              </div>
            </div>

            {/* Marriage Status */}
            <div className="relationship-form__group">
              <label htmlFor="marriageStatus" className="relationship-form__label">
                Status
              </label>
              <select
                id="marriageStatus"
                name="marriageStatus"
                value={formData.marriageStatus}
                onChange={handleChange}
                className="relationship-form__select"
              >
                <option value="betrothed">Betrothed</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
              </select>
            </div>

            {/* Betrothal Date - shown when betrothed */}
            {formData.marriageStatus === 'betrothed' && (
              <div className="relationship-form__group">
                <label htmlFor="betrothalDate" className="relationship-form__label">
                  Betrothal Date
                </label>
                <input
                  type="text"
                  id="betrothalDate"
                  name="betrothalDate"
                  value={formData.betrothalDate}
                  onChange={handleChange}
                  className={`relationship-form__input ${errors.betrothalDate ? 'relationship-form__input--error' : ''}`}
                  placeholder="YYYY-MM-DD or YYYY"
                />
                {errors.betrothalDate ? (
                  <span className="relationship-form__error">
                    <Icon name="alert-circle" size={12} />
                    {errors.betrothalDate}
                  </span>
                ) : (
                  <span className="relationship-form__hint">
                    Format: YYYY-MM-DD, YYYY-MM, or YYYY
                  </span>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form Actions */}
      <div className="relationship-form__actions">
        <ActionButton
          type="button"
          onClick={onCancel}
          variant="ghost"
        >
          Cancel
        </ActionButton>
        <ActionButton
          type="submit"
          icon={relationship ? 'save' : 'plus'}
          variant="primary"
          disabled={warnings.length > 0 && !warningsAcknowledged}
        >
          {relationship ? 'Update Relationship' : 'Create Relationship'}
        </ActionButton>
      </div>
    </form>
  );
}

export default RelationshipForm;
