/**
 * useFormState - Shared form state management hook
 *
 * Centralizes common form patterns across PersonForm, HouseForm,
 * RelationshipForm, DignityForm, and CodexEntryForm
 */
import { useState, useCallback } from 'react';

/**
 * Custom hook for managing form state
 * @param {Object} initialData - Initial form data
 * @returns {Object} Form state and handlers
 */
export function useFormState(initialData = {}) {
  const [formData, setFormData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Handle input change - supports text, checkbox, select
   */
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  }, [errors]);

  /**
   * Handle multiple field updates at once
   */
  const setFields = useCallback((updates) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Set a single field value programmatically
   */
  const setField = useCallback((name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  }, [errors]);

  /**
   * Reset form to initial state
   */
  const reset = useCallback((newInitialData) => {
    setFormData(newInitialData || initialData);
    setErrors({});
  }, [initialData]);

  /**
   * Set specific errors
   */
  const setFormErrors = useCallback((newErrors) => {
    setErrors(newErrors);
  }, []);

  /**
   * Clear all errors
   */
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  /**
   * Check if form has any errors
   */
  const hasErrors = Object.keys(errors).length > 0;

  return {
    formData,
    setFormData,
    errors,
    setErrors: setFormErrors,
    clearErrors,
    hasErrors,
    loading,
    setLoading,
    saving,
    setSaving,
    handleChange,
    setFields,
    setField,
    reset
  };
}

/**
 * Common validation rules
 */
export const validationRules = {
  /**
   * Validate date format (YYYY, YYYY-MM, or YYYY-MM-DD)
   */
  isValidDate: (dateString) => {
    if (!dateString) return true; // Empty is valid (optional)
    const dateRegex = /^\d{4}(-\d{2}(-\d{2})?)?$/;
    return dateRegex.test(dateString);
  },

  /**
   * Validate required field
   */
  isRequired: (value) => {
    if (typeof value === 'string') return value.trim().length > 0;
    return value !== null && value !== undefined;
  },

  /**
   * Validate minimum length
   */
  minLength: (value, min) => {
    return typeof value === 'string' && value.trim().length >= min;
  },

  /**
   * Validate maximum length
   */
  maxLength: (value, max) => {
    return typeof value === 'string' && value.trim().length <= max;
  }
};

/**
 * Run validation against a set of rules
 * @param {Object} data - Form data to validate
 * @param {Object} rules - Validation rules { fieldName: [{ test, message }] }
 * @returns {Object} { isValid: boolean, errors: { field: message } }
 */
export function validate(data, rules) {
  const errors = {};

  for (const [field, fieldRules] of Object.entries(rules)) {
    for (const rule of fieldRules) {
      if (!rule.test(data[field])) {
        errors[field] = rule.message;
        break; // Only show first error per field
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export default useFormState;
