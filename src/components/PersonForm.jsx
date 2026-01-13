import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { isFeatureEnabled } from '../config/featureFlags';
import EpithetsSection from './EpithetsSection';
import Icon from './icons/Icon';
import ActionButton from './shared/ActionButton';
import './PersonForm.css';

/**
 * PersonForm Component
 *
 * A form for adding or editing a person in the family tree.
 * Features medieval manuscript styling with validation feedback.
 *
 * Props:
 * - person: Existing person data (for editing) or null (for new person)
 * - houses: Array of all houses (for the dropdown)
 * - onSave: Function to call when form is submitted
 * - onCancel: Function to call when user cancels
 */

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 }
  }
};

function PersonForm({ person = null, houses = [], onSave, onCancel }) {
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    firstName: person?.firstName || '',
    lastName: person?.lastName || '',
    maidenName: person?.maidenName || '',
    dateOfBirth: person?.dateOfBirth || '',
    dateOfDeath: person?.dateOfDeath || '',
    gender: person?.gender || 'male',
    houseId: person?.houseId || null,
    legitimacyStatus: person?.legitimacyStatus || 'legitimate',
    species: person?.species || '',
    magicalBloodline: person?.magicalBloodline || '',
    titles: person?.titles ? person.titles.join(', ') : '',
    notes: person?.notes || '',
    portraitUrl: person?.portraitUrl || '',
    epithets: person?.epithets || []
  });

  // Track validation errors
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value === '' ? null : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.firstName?.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName?.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    const dateRegex = /^\d{4}(-\d{2}(-\d{2})?)?$/;
    if (formData.dateOfBirth && !dateRegex.test(formData.dateOfBirth)) {
      newErrors.dateOfBirth = 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD';
    }
    if (formData.dateOfDeath && !dateRegex.test(formData.dateOfDeath)) {
      newErrors.dateOfDeath = 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD';
    }

    if (formData.dateOfBirth && formData.dateOfDeath) {
      if (formData.dateOfDeath < formData.dateOfBirth) {
        newErrors.dateOfDeath = 'Death date cannot be before birth date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      const titlesArray = formData.titles
        ? formData.titles.split(',').map(t => t.trim()).filter(t => t)
        : [];

      const personData = {
        ...formData,
        titles: titlesArray,
        houseId: formData.houseId ? parseInt(formData.houseId) : null,
        maidenName: formData.maidenName || null,
        dateOfBirth: formData.dateOfBirth || null,
        dateOfDeath: formData.dateOfDeath || null,
        species: formData.species || null,
        magicalBloodline: formData.magicalBloodline || null,
        portraitUrl: formData.portraitUrl || null,
        epithets: formData.epithets || []
      };

      if (person?.id) {
        personData.id = person.id;
      }

      onSave(personData);
    }
  };

  const showFantasyFields = isFeatureEnabled('MODULE_1E.SPECIES_FIELD') ||
    isFeatureEnabled('MODULE_1E.MAGICAL_BLOODLINES') ||
    isFeatureEnabled('MODULE_1E.TITLES_SYSTEM');

  return (
    <form onSubmit={handleSubmit} className="person-form">
      {/* Basic Information */}
      <motion.div
        className="person-form__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <h3 className="person-form__section-title">
          <Icon name="user" size={16} />
          <span>Basic Information</span>
        </h3>

        <div className="person-form__row">
          {/* First Name */}
          <div className="person-form__group">
            <label htmlFor="firstName" className="person-form__label person-form__label--required">
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className={`person-form__input ${errors.firstName ? 'person-form__input--error' : ''}`}
              placeholder="e.g., Jon"
            />
            {errors.firstName && (
              <span className="person-form__error">
                <Icon name="alert-circle" size={12} />
                {errors.firstName}
              </span>
            )}
          </div>

          {/* Last Name */}
          <div className="person-form__group">
            <label htmlFor="lastName" className="person-form__label person-form__label--required">
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className={`person-form__input ${errors.lastName ? 'person-form__input--error' : ''}`}
              placeholder="e.g., Snow"
            />
            {errors.lastName && (
              <span className="person-form__error">
                <Icon name="alert-circle" size={12} />
                {errors.lastName}
              </span>
            )}
          </div>
        </div>

        {/* Maiden Name */}
        <div className="person-form__group">
          <label htmlFor="maidenName" className="person-form__label">
            Maiden Name
          </label>
          <input
            type="text"
            id="maidenName"
            name="maidenName"
            value={formData.maidenName || ''}
            onChange={handleChange}
            className="person-form__input"
            placeholder="Birth surname if changed through marriage"
          />
          <span className="person-form__hint">Optional - for those who changed their name</span>
        </div>

        <div className="person-form__row">
          {/* Gender */}
          <div className="person-form__group">
            <label htmlFor="gender" className="person-form__label">
              Gender
            </label>
            <select
              id="gender"
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="person-form__select"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* House */}
          <div className="person-form__group">
            <label htmlFor="houseId" className="person-form__label">
              House
            </label>
            <select
              id="houseId"
              name="houseId"
              value={formData.houseId || ''}
              onChange={handleChange}
              className="person-form__select"
            >
              <option value="">No House (Commoner)</option>
              {houses.map(house => (
                <option key={house.id} value={house.id}>
                  {house.houseName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Dates Section */}
      <motion.div
        className="person-form__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.1 }}
      >
        <h3 className="person-form__section-title">
          <Icon name="calendar" size={16} />
          <span>Dates</span>
        </h3>

        <div className="person-form__row">
          {/* Date of Birth */}
          <div className="person-form__group">
            <label htmlFor="dateOfBirth" className="person-form__label">
              Date of Birth
            </label>
            <input
              type="text"
              id="dateOfBirth"
              name="dateOfBirth"
              value={formData.dateOfBirth || ''}
              onChange={handleChange}
              className={`person-form__input ${errors.dateOfBirth ? 'person-form__input--error' : ''}`}
              placeholder="YYYY-MM-DD or YYYY"
            />
            {errors.dateOfBirth ? (
              <span className="person-form__error">
                <Icon name="alert-circle" size={12} />
                {errors.dateOfBirth}
              </span>
            ) : (
              <span className="person-form__hint">Format: YYYY-MM-DD, YYYY-MM, or YYYY</span>
            )}
          </div>

          {/* Date of Death */}
          <div className="person-form__group">
            <label htmlFor="dateOfDeath" className="person-form__label">
              Date of Death
            </label>
            <input
              type="text"
              id="dateOfDeath"
              name="dateOfDeath"
              value={formData.dateOfDeath || ''}
              onChange={handleChange}
              className={`person-form__input ${errors.dateOfDeath ? 'person-form__input--error' : ''}`}
              placeholder="YYYY-MM-DD or YYYY"
            />
            {errors.dateOfDeath ? (
              <span className="person-form__error">
                <Icon name="alert-circle" size={12} />
                {errors.dateOfDeath}
              </span>
            ) : (
              <span className="person-form__hint">Leave blank if still living</span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Status Section */}
      <motion.div
        className="person-form__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.2 }}
      >
        <h3 className="person-form__section-title">
          <Icon name="shield" size={16} />
          <span>Status</span>
        </h3>

        <div className="person-form__group">
          <label htmlFor="legitimacyStatus" className="person-form__label">
            Legitimacy Status
          </label>
          <select
            id="legitimacyStatus"
            name="legitimacyStatus"
            value={formData.legitimacyStatus}
            onChange={handleChange}
            className="person-form__select"
          >
            <option value="legitimate">Legitimate</option>
            <option value="bastard">Bastard</option>
            <option value="adopted">Adopted</option>
            <option value="commoner">Commoner</option>
            <option value="unknown">Unknown</option>
          </select>
          <span className="person-form__hint">
            This affects the border color in the family tree visualization
          </span>
        </div>
      </motion.div>

      {/* Fantasy Elements Section */}
      {showFantasyFields && (
        <motion.div
          className="person-form__section person-form__section--fantasy"
          variants={SECTION_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
        >
          <h3 className="person-form__section-title">
            <Icon name="sparkles" size={16} />
            <span>Fantasy Elements</span>
            <span className="person-form__section-badge">Optional</span>
          </h3>

          <div className="person-form__row">
            {isFeatureEnabled('MODULE_1E.SPECIES_FIELD') && (
              <div className="person-form__group">
                <label htmlFor="species" className="person-form__label">
                  Species/Race
                </label>
                <input
                  type="text"
                  id="species"
                  name="species"
                  value={formData.species || ''}
                  onChange={handleChange}
                  className="person-form__input"
                  placeholder="e.g., Human, Elf, Dwarf"
                />
              </div>
            )}

            {isFeatureEnabled('MODULE_1E.MAGICAL_BLOODLINES') && (
              <div className="person-form__group">
                <label htmlFor="magicalBloodline" className="person-form__label">
                  Magical Bloodline
                </label>
                <input
                  type="text"
                  id="magicalBloodline"
                  name="magicalBloodline"
                  value={formData.magicalBloodline || ''}
                  onChange={handleChange}
                  className="person-form__input"
                  placeholder="e.g., Dragon Rider, Seer"
                />
              </div>
            )}
          </div>

          {isFeatureEnabled('MODULE_1E.TITLES_SYSTEM') && (
            <div className="person-form__group">
              <label htmlFor="titles" className="person-form__label">
                Titles
              </label>
              <input
                type="text"
                id="titles"
                name="titles"
                value={formData.titles || ''}
                onChange={handleChange}
                className="person-form__input"
                placeholder="Separate multiple titles with commas"
              />
              <span className="person-form__hint">
                Example: Lord of Winterfell, Warden of the North
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* Epithets Section */}
      <motion.div
        className="person-form__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.4 }}
      >
        <EpithetsSection
          epithets={formData.epithets}
          onChange={(newEpithets) => setFormData(prev => ({ ...prev, epithets: newEpithets }))}
          isDarkTheme={false}
          compact={false}
          readOnly={false}
        />
      </motion.div>

      {/* Notes Section */}
      <motion.div
        className="person-form__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.5 }}
      >
        <h3 className="person-form__section-title">
          <Icon name="file-text" size={16} />
          <span>Notes</span>
        </h3>

        <div className="person-form__group">
          <textarea
            id="notes"
            name="notes"
            value={formData.notes || ''}
            onChange={handleChange}
            rows="3"
            className="person-form__textarea"
            placeholder="Additional information about this person..."
          />
        </div>
      </motion.div>

      {/* Codex Integration */}
      {person?.codexEntryId && (
        <motion.div
          className="person-form__codex-link"
          variants={SECTION_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.6 }}
        >
          <div className="person-form__codex-info">
            <Icon name="book-open" size={20} className="person-form__codex-icon" />
            <div>
              <h4 className="person-form__codex-title">Biography Available</h4>
              <p className="person-form__codex-text">
                This person has a Codex entry for detailed biographical information.
              </p>
            </div>
          </div>
          <ActionButton
            icon="book-open"
            onClick={() => navigate(`/codex/entry/${person.codexEntryId}`)}
            variant="secondary"
          >
            View Biography
          </ActionButton>
        </motion.div>
      )}

      {/* Form Actions */}
      <div className="person-form__actions">
        <ActionButton
          type="button"
          onClick={onCancel}
          variant="ghost"
        >
          Cancel
        </ActionButton>
        <ActionButton
          type="submit"
          icon={person ? 'save' : 'plus'}
          variant="primary"
        >
          {person ? 'Update Person' : 'Create Person'}
        </ActionButton>
      </div>
    </form>
  );
}

export default PersonForm;
