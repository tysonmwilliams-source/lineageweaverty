/**
 * HouseholdRolesPanel.jsx - Household Roles Display
 *
 * PURPOSE:
 * Displays household roles for a house in a collapsible panel.
 * Shows role name, current holder, and status.
 * Allows adding, editing, and removing roles.
 *
 * USAGE:
 * <HouseholdRolesPanel
 *   houseId={houseId}
 *   people={people}
 *   onRoleChange={handleChange}
 * />
 */

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../icons/Icon';
import ActionButton from '../shared/ActionButton';
import HouseholdRoleForm from './HouseholdRoleForm';
import {
  getRolesForHouse,
  deleteHouseholdRole,
  vacateRole
} from '../../services/householdRoleService';
import {
  HOUSEHOLD_ROLE_TYPES,
  getRoleType,
  ROLE_CATEGORIES
} from '../../data/householdRoleTypes';
import './HouseholdRolesPanel.css';

// Animation variants
const PANEL_VARIANTS = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.3, ease: 'easeOut' }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2 }
  },
  exit: {
    opacity: 0,
    x: 10,
    transition: { duration: 0.15 }
  }
};

/**
 * HouseholdRolesPanel Component
 *
 * @param {Object} props
 * @param {number} props.houseId - House ID to show roles for
 * @param {Array} props.people - Array of all people for holder selection
 * @param {Function} props.onRoleChange - Called when roles are modified
 * @param {boolean} props.defaultExpanded - Start expanded (default: false)
 * @param {boolean} props.readOnly - Disable editing (default: false)
 */
function HouseholdRolesPanel({
  houseId,
  people = [],
  onRoleChange,
  defaultExpanded = false,
  readOnly = false
}) {
  // State
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  // Load roles
  const loadRoles = useCallback(async () => {
    if (!houseId) return;

    try {
      setLoading(true);
      const houseRoles = await getRolesForHouse(houseId);
      setRoles(houseRoles);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading roles:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [houseId]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // People lookup map
  const peopleById = useMemo(() => {
    return new Map(people.map(p => [p.id, p]));
  }, [people]);

  // Get person name
  const getPersonName = useCallback((personId) => {
    if (!personId) return null;
    const person = peopleById.get(personId);
    if (!person) return 'Unknown';
    return `${person.firstName} ${person.lastName}`;
  }, [peopleById]);

  // Statistics
  const stats = useMemo(() => {
    const filled = roles.filter(r => r.currentHolderId !== null).length;
    return {
      total: roles.length,
      filled,
      vacant: roles.length - filled
    };
  }, [roles]);

  // Handlers
  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleAddRole = useCallback(() => {
    setEditingRole(null);
    setShowForm(true);
  }, []);

  const handleEditRole = useCallback((role) => {
    setEditingRole(role);
    setShowForm(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingRole(null);
  }, []);

  const handleRoleSaved = useCallback(() => {
    setShowForm(false);
    setEditingRole(null);
    loadRoles();
    onRoleChange?.();
  }, [loadRoles, onRoleChange]);

  const handleDeleteRole = useCallback(async (roleId) => {
    if (!confirm('Remove this role from the household?')) return;

    try {
      await deleteHouseholdRole(roleId);
      loadRoles();
      onRoleChange?.();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting role:', error);
      }
    }
  }, [loadRoles, onRoleChange]);

  const handleVacateRole = useCallback(async (roleId) => {
    try {
      await vacateRole(roleId);
      loadRoles();
      onRoleChange?.();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error vacating role:', error);
      }
    }
  }, [loadRoles, onRoleChange]);

  // Render role item
  const renderRoleItem = (role) => {
    const roleType = getRoleType(role.roleType);
    const holderName = getPersonName(role.currentHolderId);
    const isVacant = !role.currentHolderId;

    return (
      <motion.div
        key={role.id}
        className={`household-role ${isVacant ? 'household-role--vacant' : ''}`}
        variants={ITEM_VARIANTS}
        layout
      >
        <div className="household-role__icon">
          <Icon name={roleType?.icon || 'user'} size={18} />
        </div>

        <div className="household-role__info">
          <span className="household-role__title">
            {role.roleType === 'custom' && role.customRoleName
              ? role.customRoleName
              : roleType?.name || role.roleType}
          </span>
          <span className={`household-role__holder ${isVacant ? 'household-role__holder--vacant' : ''}`}>
            {isVacant ? 'Vacant' : holderName}
          </span>
        </div>

        {!readOnly && (
          <div className="household-role__actions">
            {!isVacant && (
              <button
                className="household-role__action"
                onClick={() => handleVacateRole(role.id)}
                title="Vacate position"
              >
                <Icon name="user-minus" size={14} />
              </button>
            )}
            <button
              className="household-role__action"
              onClick={() => handleEditRole(role)}
              title="Edit role"
            >
              <Icon name="edit-2" size={14} />
            </button>
            <button
              className="household-role__action household-role__action--danger"
              onClick={() => handleDeleteRole(role.id)}
              title="Remove role"
            >
              <Icon name="trash-2" size={14} />
            </button>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="household-roles-panel">
      {/* Header */}
      <button
        className="household-roles-panel__header"
        onClick={toggleExpanded}
        aria-expanded={expanded}
      >
        <div className="household-roles-panel__header-left">
          <Icon
            name="users"
            size={18}
            className="household-roles-panel__header-icon"
          />
          <span className="household-roles-panel__title">Household Roles</span>
          {stats.total > 0 && (
            <span className="household-roles-panel__count">
              {stats.filled}/{stats.total}
            </span>
          )}
        </div>

        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          className="household-roles-panel__toggle"
        />
      </button>

      {/* Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="household-roles-panel__content"
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            {/* Loading */}
            {loading && (
              <div className="household-roles-panel__loading">
                <Icon name="loader-2" size={20} className="spin" />
                <span>Loading roles...</span>
              </div>
            )}

            {/* Empty state */}
            {!loading && roles.length === 0 && (
              <div className="household-roles-panel__empty">
                <Icon name="users" size={24} />
                <p>No household roles defined</p>
                {!readOnly && (
                  <ActionButton
                    icon="plus"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddRole}
                  >
                    Add Role
                  </ActionButton>
                )}
              </div>
            )}

            {/* Roles list */}
            {!loading && roles.length > 0 && (
              <>
                <div className="household-roles-panel__list">
                  <AnimatePresence mode="popLayout">
                    {roles.map(renderRoleItem)}
                  </AnimatePresence>
                </div>

                {/* Add button */}
                {!readOnly && (
                  <div className="household-roles-panel__footer">
                    <ActionButton
                      icon="plus"
                      variant="ghost"
                      size="sm"
                      onClick={handleAddRole}
                    >
                      Add Role
                    </ActionButton>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <HouseholdRoleForm
            houseId={houseId}
            role={editingRole}
            people={people}
            existingRoleTypes={roles.map(r => r.roleType)}
            onSave={handleRoleSaved}
            onClose={handleCloseForm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(HouseholdRolesPanel);
