/**
 * HouseholdRoleForm.jsx - Add/Edit Household Role Modal
 *
 * PURPOSE:
 * Modal form for creating or editing household roles.
 * Allows selecting role type, assigning holder, and setting dates.
 *
 * USAGE:
 * <HouseholdRoleForm
 *   houseId={houseId}
 *   role={existingRole}
 *   people={people}
 *   onSave={handleSave}
 *   onClose={handleClose}
 * />
 */

import { useState, useCallback, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import Icon from '../icons/Icon';
import ActionButton from '../shared/ActionButton';
import {
  createHouseholdRole,
  updateHouseholdRole
} from '../../services/householdRoleService';
import {
  HOUSEHOLD_ROLE_TYPES,
  ROLE_CATEGORIES,
  getRolesGroupedByCategory
} from '../../data/householdRoleTypes';
import './HouseholdRoleForm.css';

// Animation variants
const OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 }
};

const MODAL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' }
  }
};

/**
 * HouseholdRoleForm Component
 *
 * @param {Object} props
 * @param {number} props.houseId - House ID
 * @param {Object} [props.role] - Existing role to edit (null for new)
 * @param {Array} props.people - Array of people for holder selection
 * @param {Array} [props.existingRoleTypes] - Role types already in use
 * @param {Function} props.onSave - Called after successful save
 * @param {Function} props.onClose - Called to close the modal
 */
function HouseholdRoleForm({
  houseId,
  role = null,
  people = [],
  existingRoleTypes = [],
  onSave,
  onClose
}) {
  const isEditing = !!role;

  // Form state
  const [roleType, setRoleType] = useState(role?.roleType || '');
  const [customRoleName, setCustomRoleName] = useState(role?.customRoleName || '');
  const [currentHolderId, setCurrentHolderId] = useState(role?.currentHolderId || '');
  const [startDate, setStartDate] = useState(role?.startDate || '');
  const [notes, setNotes] = useState(role?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Grouped roles for select
  const rolesByCategory = useMemo(() => getRolesGroupedByCategory(), []);

  // Check if role type is available (not already assigned to house)
  const isRoleTypeAvailable = useCallback((type) => {
    if (isEditing && type === role.roleType) return true;
    return !existingRoleTypes.includes(type);
  }, [isEditing, role, existingRoleTypes]);

  // Validation
  const isValid = useMemo(() => {
    if (!roleType) return false;
    if (roleType === 'custom' && !customRoleName.trim()) return false;
    return true;
  }, [roleType, customRoleName]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const roleData = {
        houseId,
        roleType,
        customRoleName: roleType === 'custom' ? customRoleName.trim() : null,
        currentHolderId: currentHolderId ? parseInt(currentHolderId, 10) : null,
        startDate: startDate || null,
        notes: notes.trim() || null
      };

      if (isEditing) {
        await updateHouseholdRole(role.id, roleData);
      } else {
        await createHouseholdRole(roleData);
      }

      onSave?.();
    } catch (err) {
      setError(err.message || 'Failed to save role');
      if (import.meta.env.DEV) {
        console.error('Error saving role:', err);
      }
    } finally {
      setSaving(false);
    }
  }, [isValid, houseId, roleType, customRoleName, currentHolderId, startDate, notes, isEditing, role, onSave]);

  // Handle overlay click
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  }, [onClose]);

  return (
    <motion.div
      className="household-role-form__overlay"
      variants={OVERLAY_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="hidden"
      onClick={handleOverlayClick}
    >
      <motion.div
        className="household-role-form"
        variants={MODAL_VARIANTS}
        initial="hidden"
        animate="visible"
        exit="hidden"
        role="dialog"
        aria-labelledby="role-form-title"
      >
        {/* Header */}
        <div className="household-role-form__header">
          <h2 id="role-form-title" className="household-role-form__title">
            <Icon name={isEditing ? 'edit-2' : 'plus'} size={20} />
            <span>{isEditing ? 'Edit Role' : 'Add Household Role'}</span>
          </h2>
          <button
            className="household-role-form__close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="household-role-form__body">
          {/* Error */}
          {error && (
            <div className="household-role-form__error">
              <Icon name="alert-triangle" size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Role Type */}
          <div className="household-role-form__field">
            <label htmlFor="roleType" className="household-role-form__label">
              Role Type <span className="required">*</span>
            </label>
            <select
              id="roleType"
              className="household-role-form__select"
              value={roleType}
              onChange={(e) => setRoleType(e.target.value)}
              disabled={saving}
            >
              <option value="">Select a role...</option>
              {Object.values(ROLE_CATEGORIES).map(category => (
                <optgroup key={category.id} label={category.name}>
                  {rolesByCategory[category.id]?.map(rt => (
                    <option
                      key={rt.id}
                      value={rt.id}
                      disabled={!isRoleTypeAvailable(rt.id)}
                    >
                      {rt.name}
                      {!isRoleTypeAvailable(rt.id) ? ' (assigned)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Custom Role Name (only if custom type) */}
          {roleType === 'custom' && (
            <div className="household-role-form__field">
              <label htmlFor="customRoleName" className="household-role-form__label">
                Custom Role Name <span className="required">*</span>
              </label>
              <input
                id="customRoleName"
                type="text"
                className="household-role-form__input"
                value={customRoleName}
                onChange={(e) => setCustomRoleName(e.target.value)}
                placeholder="e.g., Court Jester"
                disabled={saving}
              />
            </div>
          )}

          {/* Current Holder */}
          <div className="household-role-form__field">
            <label htmlFor="currentHolderId" className="household-role-form__label">
              Current Holder
            </label>
            <select
              id="currentHolderId"
              className="household-role-form__select"
              value={currentHolderId}
              onChange={(e) => setCurrentHolderId(e.target.value)}
              disabled={saving}
            >
              <option value="">Vacant</option>
              {people.map(person => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
            <p className="household-role-form__hint">
              Leave empty if the position is currently vacant
            </p>
          </div>

          {/* Start Date */}
          {currentHolderId && (
            <div className="household-role-form__field">
              <label htmlFor="startDate" className="household-role-form__label">
                Start Date
              </label>
              <input
                id="startDate"
                type="text"
                className="household-role-form__input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="e.g., 298 AC, Year 1420"
                disabled={saving}
              />
              <p className="household-role-form__hint">
                When this person began in the role
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="household-role-form__field">
            <label htmlFor="notes" className="household-role-form__label">
              Notes
            </label>
            <textarea
              id="notes"
              className="household-role-form__textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional information about this role..."
              rows={3}
              disabled={saving}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="household-role-form__footer">
          <ActionButton
            variant="ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </ActionButton>
          <ActionButton
            icon={saving ? 'loader-2' : 'check'}
            variant="primary"
            onClick={handleSave}
            disabled={!isValid || saving}
            className={saving ? 'spin-icon' : ''}
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Role'}
          </ActionButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default memo(HouseholdRoleForm);
