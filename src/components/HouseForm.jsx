/**
 * HouseForm.jsx - House Creation/Editing Form
 *
 * A form for adding or editing a house/family with integrated
 * heraldry management section.
 *
 * HERALDRY FEATURES:
 * - Display current linked heraldry with thumbnail
 * - "Create New" → opens HeraldryCreator with house pre-selected
 * - "Link Existing" → opens HeraldryPickerModal
 * - "View/Edit" → navigates to HeraldryCreator in edit mode
 * - "Remove" → unlinks heraldry (doesn't delete)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import HeraldryPickerModal from './heraldry/HeraldryPickerModal';
import Icon from './icons/Icon';
import ActionButton from './shared/ActionButton';
import { HouseholdRolesPanel } from './household';
import { useDataset } from '../contexts/DatasetContext';
import { useAuth } from '../contexts/AuthContext';
import {
  getHeraldry,
  linkHeraldryToEntity,
  unlinkHeraldry,
  getHeraldryLinks
} from '../services/heraldryService';
import { sanitizeSVG } from '../utils/sanitize';
import './HouseForm.css';

// House type options
const HOUSE_TYPE_OPTIONS = [
  { value: 'great', label: 'Great House' },
  { value: 'cadet', label: 'Cadet Branch' },
  { value: 'minor', label: 'Minor House' },
  { value: 'vassal', label: 'Vassal House' },
  { value: 'extinct', label: 'Extinct House' }
];

// Cadet tier options
const CADET_TIER_OPTIONS = [
  { value: 1, label: 'Tier 1 - Noble Cadet Branch' },
  { value: 2, label: 'Tier 2 - Bastard Elevation' }
];

// Founding type options
const FOUNDING_TYPE_OPTIONS = [
  { value: 'noble', label: 'Noble' },
  { value: 'bastard-elevation', label: 'Bastard Elevation' }
];

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 }
  }
};

function HouseForm({
  house = null,
  people = [],
  houses = [],
  onSave,
  onCancel
}) {
  const navigate = useNavigate();
  const { activeDataset } = useDataset();
  const { user } = useAuth();

  // Form State
  const [formData, setFormData] = useState({
    houseName: house?.houseName || '',
    sigil: house?.sigil || '',
    sigilImage: house?.sigilImage || null,
    motto: house?.motto || '',
    foundedDate: house?.foundedDate || '',
    colorCode: house?.colorCode || '#3b82f6',
    notes: house?.notes || '',
    heraldryId: house?.heraldryId || null,
    // House Classification fields
    houseType: house?.houseType || 'great',
    parentHouseId: house?.parentHouseId || null,
    cadetTier: house?.cadetTier || null,
    foundingType: house?.foundingType || null,
    foundedBy: house?.foundedBy || null,
    swornTo: house?.swornTo || null
  });

  // Heraldry State
  const [linkedHeraldry, setLinkedHeraldry] = useState(null);
  const [loadingHeraldry, setLoadingHeraldry] = useState(false);
  const [showHeraldryPicker, setShowHeraldryPicker] = useState(false);
  const [heraldryLinkId, setHeraldryLinkId] = useState(null);

  // Validation State
  const [errors, setErrors] = useState({});

  // Load Heraldry
  useEffect(() => {
    if (house?.heraldryId) {
      loadLinkedHeraldry(house.heraldryId);
    }
  }, [house?.heraldryId, activeDataset]);

  const loadLinkedHeraldry = async (heraldryId) => {
    const datasetId = activeDataset?.id;
    try {
      setLoadingHeraldry(true);
      const heraldry = await getHeraldry(heraldryId, datasetId);
      setLinkedHeraldry(heraldry);

      if (house?.id) {
        const links = await getHeraldryLinks(heraldryId, datasetId);
        const houseLink = links.find(l =>
          l.entityType === 'house' &&
          l.entityId === house.id
        );
        setHeraldryLinkId(houseLink?.id || null);
      }
    } catch (error) {
      console.error('Error loading heraldry:', error);
    } finally {
      setLoadingHeraldry(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.houseName.trim()) {
      newErrors.houseName = 'House name is required';
    }

    if (formData.foundedDate && !/^\d{4}$/.test(formData.foundedDate)) {
      newErrors.foundedDate = 'Founded date must be a 4-digit year (e.g., 1120)';
    }

    // Validate cadet-specific fields
    if (formData.houseType === 'cadet' && !formData.parentHouseId) {
      newErrors.parentHouseId = 'Parent house is required for cadet branches';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      const houseData = house?.id
        ? { ...formData, id: house.id }
        : formData;

      onSave(houseData);
    }
  };

  // Heraldry Handlers
  const handleCreateHeraldry = () => {
    if (house?.id) {
      navigate(`/heraldry/create?houseId=${house.id}&houseName=${encodeURIComponent(house.houseName)}`);
    } else {
      alert('Please save the house first, then you can create heraldry for it.');
    }
  };

  const handleLinkHeraldry = (selectedHeraldry) => {
    if (!house?.id) {
      alert('Please save the house first, then you can link heraldry to it.');
      return;
    }

    const datasetId = activeDataset?.id;
    linkHeraldryToEntity({
      heraldryId: selectedHeraldry.id,
      entityType: 'house',
      entityId: house.id,
      linkType: 'primary'
    }, user?.uid, datasetId).then(() => {
      setLinkedHeraldry(selectedHeraldry);
      setFormData(prev => ({ ...prev, heraldryId: selectedHeraldry.id }));
      setShowHeraldryPicker(false);
    }).catch(error => {
      console.error('Error linking heraldry:', error);
      alert('Failed to link heraldry. Please try again.');
    });
  };

  const handleViewHeraldry = () => {
    if (linkedHeraldry?.id) {
      navigate(`/heraldry/edit/${linkedHeraldry.id}`);
    }
  };

  const handleRemoveHeraldry = async () => {
    if (!linkedHeraldry) return;

    const confirm = window.confirm(
      `Remove heraldry link for "${linkedHeraldry.name}"?\n\nThis will unlink the heraldry from this house but will not delete the heraldry itself.`
    );

    if (!confirm) return;

    try {
      const datasetId = activeDataset?.id;
      if (heraldryLinkId) {
        // Signature is (linkId, userId, datasetId) — passing datasetId in the
        // userId slot silently unlinked from the default world and skipped sync.
        await unlinkHeraldry(heraldryLinkId, user?.uid, datasetId);
      }

      setLinkedHeraldry(null);
      setHeraldryLinkId(null);
      setFormData(prev => ({ ...prev, heraldryId: null }));
    } catch (error) {
      console.error('Error removing heraldry link:', error);
      alert('Failed to remove heraldry link. Please try again.');
    }
  };

  return (
    <>
      <form className="house-form" onSubmit={handleSubmit}>
        {/* Basic Information */}
        <motion.div
          className="house-form__section"
          variants={SECTION_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          <h3 className="house-form__section-title">
            <Icon name="castle" size={16} />
            <span>House Information</span>
          </h3>

          {/* House Name */}
          <div className="house-form__group">
            <label htmlFor="houseName" className="house-form__label house-form__label--required">
              House Name
            </label>
            <input
              type="text"
              id="houseName"
              name="houseName"
              value={formData.houseName}
              onChange={handleChange}
              placeholder="e.g., House Stark"
              className={`house-form__input ${errors.houseName ? 'house-form__input--error' : ''}`}
            />
            {errors.houseName && (
              <span className="house-form__error">
                <Icon name="alert-circle" size={12} />
                {errors.houseName}
              </span>
            )}
          </div>

          {/* Motto */}
          <div className="house-form__group">
            <label htmlFor="motto" className="house-form__label">
              House Motto
            </label>
            <input
              type="text"
              id="motto"
              name="motto"
              value={formData.motto}
              onChange={handleChange}
              placeholder="e.g., Winter is Coming"
              className="house-form__input"
            />
          </div>

          <div className="house-form__row">
            {/* Founded Date */}
            <div className="house-form__group">
              <label htmlFor="foundedDate" className="house-form__label">
                Founded Year
              </label>
              <input
                type="text"
                id="foundedDate"
                name="foundedDate"
                value={formData.foundedDate}
                onChange={handleChange}
                placeholder="e.g., 1120"
                maxLength="4"
                className={`house-form__input ${errors.foundedDate ? 'house-form__input--error' : ''}`}
              />
              {errors.foundedDate && (
                <span className="house-form__error">
                  <Icon name="alert-circle" size={12} />
                  {errors.foundedDate}
                </span>
              )}
            </div>

            {/* Color Code */}
            <div className="house-form__group">
              <label htmlFor="colorCode" className="house-form__label">
                House Color
              </label>
              <div className="house-form__color-row">
                <input
                  type="color"
                  id="colorCode"
                  name="colorCode"
                  value={formData.colorCode}
                  onChange={handleChange}
                  className="house-form__color-input"
                />
                <span className="house-form__hint">
                  Used to color-code this house in the family tree
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* House Classification Section */}
        <motion.div
          className="house-form__section house-form__section--classification"
          variants={SECTION_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.05 }}
        >
          <h3 className="house-form__section-title">
            <Icon name="crown" size={16} />
            <span>House Classification</span>
          </h3>

          {/* House Type */}
          <div className="house-form__group">
            <label htmlFor="houseType" className="house-form__label">
              House Type
            </label>
            <select
              id="houseType"
              name="houseType"
              value={formData.houseType}
              onChange={handleChange}
              className="house-form__select"
            >
              {HOUSE_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Cadet Fields */}
          <AnimatePresence>
            {formData.houseType === 'cadet' && (
              <motion.div
                className="house-form__cadet-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Parent House */}
                <div className="house-form__group">
                  <label htmlFor="parentHouseId" className="house-form__label house-form__label--required">
                    Parent House
                  </label>
                  <select
                    id="parentHouseId"
                    name="parentHouseId"
                    value={formData.parentHouseId || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      parentHouseId: e.target.value ? parseInt(e.target.value) : null
                    }))}
                    className={`house-form__select ${errors.parentHouseId ? 'house-form__select--error' : ''}`}
                  >
                    <option value="">Select parent house...</option>
                    {houses
                      .filter(h => h.id !== house?.id)
                      .map(h => (
                        <option key={h.id} value={h.id}>
                          {h.houseName}
                        </option>
                      ))
                    }
                  </select>
                  {errors.parentHouseId && (
                    <span className="house-form__error">
                      <Icon name="alert-circle" size={12} />
                      {errors.parentHouseId}
                    </span>
                  )}
                </div>

                {/* Cadet Tier */}
                <div className="house-form__group">
                  <label htmlFor="cadetTier" className="house-form__label">
                    Cadet Tier
                  </label>
                  <select
                    id="cadetTier"
                    name="cadetTier"
                    value={formData.cadetTier || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      cadetTier: e.target.value ? parseInt(e.target.value) : null
                    }))}
                    className="house-form__select"
                  >
                    <option value="">Select tier...</option>
                    {CADET_TIER_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="house-form__hint">
                    Tier 1 for noble cadets, Tier 2 for bastard-founded houses
                  </span>
                </div>

                {/* Founding Type */}
                <div className="house-form__group">
                  <label htmlFor="foundingType" className="house-form__label">
                    Founding Type
                  </label>
                  <select
                    id="foundingType"
                    name="foundingType"
                    value={formData.foundingType || ''}
                    onChange={handleChange}
                    className="house-form__select"
                  >
                    <option value="">Select founding type...</option>
                    {FOUNDING_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Founded By */}
                <div className="house-form__group">
                  <label htmlFor="foundedBy" className="house-form__label">
                    Founded By
                  </label>
                  <select
                    id="foundedBy"
                    name="foundedBy"
                    value={formData.foundedBy || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      foundedBy: e.target.value ? parseInt(e.target.value) : null
                    }))}
                    className="house-form__select"
                  >
                    <option value="">Select founder...</option>
                    {people.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                        {p.legitimacyStatus === 'bastard' ? ' (Bastard)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Default Allegiance — for bastard-elevation cadets */}
                {(formData.cadetTier === 2 || formData.foundingType === 'bastard-elevation' ||
                  /^(Dum|Dun)/i.test(formData.houseName)) && (
                  <div className="house-form__group">
                    <label htmlFor="swornTo" className="house-form__label">
                      Default Allegiance
                    </label>
                    <select
                      id="swornTo"
                      name="swornTo"
                      value={formData.swornTo || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        swornTo: e.target.value ? parseInt(e.target.value) : null
                      }))}
                      className="house-form__select"
                    >
                      <option value="">No default allegiance</option>
                      {houses
                        .filter(h => h.id !== house?.id)
                        .sort((a, b) => a.houseName.localeCompare(b.houseName))
                        .map(h => (
                          <option key={h.id} value={h.id}>{h.houseName}</option>
                        ))
                      }
                    </select>
                    <p className="house-form__help-text" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                      Members without personal allegiance default to this house
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Heraldry Section */}
        <motion.div
          className="house-form__section house-form__section--heraldry"
          variants={SECTION_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <h3 className="house-form__section-title">
            <Icon name="shield" size={16} />
            <span>House Heraldry</span>
          </h3>

          {loadingHeraldry ? (
            <div className="house-form__heraldry-loading">
              <Icon name="loader-2" size={20} className="spin" />
              <span>Loading heraldry...</span>
            </div>
          ) : linkedHeraldry ? (
            <div className="house-form__heraldry-display">
              {/* Thumbnail */}
              <div
                className="house-form__heraldry-thumbnail"
                style={{ borderColor: formData.colorCode || 'var(--border-primary)' }}
              >
                {linkedHeraldry.heraldrySVG ? (
                  <div
                    className="house-form__heraldry-svg"
                    dangerouslySetInnerHTML={{ __html: sanitizeSVG(linkedHeraldry.heraldrySVG) }}
                  />
                ) : linkedHeraldry.heraldryDisplay || linkedHeraldry.heraldryThumbnail ? (
                  <img
                    src={linkedHeraldry.heraldryDisplay || linkedHeraldry.heraldryThumbnail}
                    alt={linkedHeraldry.name}
                  />
                ) : (
                  <Icon name="shield" size={40} className="house-form__heraldry-placeholder" />
                )}
              </div>

              {/* Info & Actions */}
              <div className="house-form__heraldry-info">
                <div className="house-form__heraldry-name">
                  {linkedHeraldry.name || 'Untitled Arms'}
                </div>

                {linkedHeraldry.blazon && (
                  <div className="house-form__heraldry-blazon">
                    "{linkedHeraldry.blazon}"
                  </div>
                )}

                <div className="house-form__heraldry-actions">
                  <button
                    type="button"
                    onClick={handleViewHeraldry}
                    className="house-form__heraldry-btn house-form__heraldry-btn--view"
                  >
                    <Icon name="pencil" size={14} />
                    <span>View/Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHeraldryPicker(true)}
                    className="house-form__heraldry-btn house-form__heraldry-btn--change"
                  >
                    <Icon name="refresh-cw" size={14} />
                    <span>Change</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveHeraldry}
                    className="house-form__heraldry-btn house-form__heraldry-btn--remove"
                  >
                    <Icon name="x" size={14} />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="house-form__heraldry-empty">
              <p className="house-form__heraldry-empty-text">
                No heraldry linked to this house yet. Create new arms or link existing heraldry.
              </p>

              <div className="house-form__heraldry-empty-actions">
                <ActionButton
                  icon="sparkles"
                  onClick={handleCreateHeraldry}
                  disabled={!house?.id}
                  variant="primary"
                  title={!house?.id ? 'Save house first to create heraldry' : 'Create new heraldry'}
                >
                  Create New Heraldry
                </ActionButton>

                <ActionButton
                  icon="link"
                  onClick={() => setShowHeraldryPicker(true)}
                  disabled={!house?.id}
                  variant="secondary"
                  title={!house?.id ? 'Save house first to link heraldry' : 'Link existing heraldry'}
                >
                  Link Existing
                </ActionButton>
              </div>

              {!house?.id && (
                <p className="house-form__heraldry-hint">
                  <Icon name="lightbulb" size={14} />
                  <span>Save the house first to enable heraldry options</span>
                </p>
              )}
            </div>
          )}
        </motion.div>

        {/* Additional Details */}
        <motion.div
          className="house-form__section"
          variants={SECTION_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
          <h3 className="house-form__section-title">
            <Icon name="file-text" size={16} />
            <span>Additional Details</span>
          </h3>

          {/* Sigil Description */}
          <div className="house-form__group">
            <label htmlFor="sigil" className="house-form__label">
              Sigil Description
              <span className="house-form__label-hint">
                (text description, separate from heraldry)
              </span>
            </label>
            <input
              type="text"
              id="sigil"
              name="sigil"
              value={formData.sigil}
              onChange={handleChange}
              placeholder="e.g., A grey direwolf on white field"
              className="house-form__input"
            />
          </div>

          {/* Notes */}
          <div className="house-form__group">
            <label htmlFor="notes" className="house-form__label">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              placeholder="Additional information about this house..."
              className="house-form__textarea"
            />
          </div>
        </motion.div>

        {/* Household Roles Section - Only show when editing */}
        {house?.id && (
          <motion.div
            className="house-form__section house-form__section--roles"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.25 }}
          >
            <HouseholdRolesPanel
              houseId={house.id}
              people={people}
              defaultExpanded={true}
            />
          </motion.div>
        )}

        {/* Form Actions */}
        <div className="house-form__actions">
          <ActionButton
            type="button"
            onClick={onCancel}
            variant="ghost"
          >
            Cancel
          </ActionButton>
          <ActionButton
            type="submit"
            icon={house ? 'save' : 'plus'}
            variant="primary"
          >
            {house ? 'Update House' : 'Create House'}
          </ActionButton>
        </div>
      </form>

      {/* Heraldry Picker Modal */}
      <HeraldryPickerModal
        isOpen={showHeraldryPicker}
        onClose={() => setShowHeraldryPicker(false)}
        onSelect={handleLinkHeraldry}
        entityType="house"
        entityName={formData.houseName || 'New House'}
        excludeHeraldryId={linkedHeraldry?.id}
      />
    </>
  );
}

export default HouseForm;
