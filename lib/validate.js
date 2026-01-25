/**
 * Validation utilities for forms and data
 * @module lib/validate
 */

/** Common validation patterns */
export const patterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/.+/,
  phone: /^\+?[\d\s-()]{10,}$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  username: /^[a-zA-Z][a-zA-Z0-9_-]{2,}$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
};

/** Built-in validators */
const validators = {
  required: v => v != null && v !== '',
  email: v => !v || patterns.email.test(v),
  url: v => !v || patterns.url.test(v),
  phone: v => !v || patterns.phone.test(v),
  min: (v, n) => !v || v.length >= n,
  max: (v, n) => !v || v.length <= n,
  minValue: (v, n) => v == null || v >= n,
  maxValue: (v, n) => v == null || v <= n,
  pattern: (v, re) => !v || (typeof re === 'string' ? new RegExp(re) : re).test(v),
  match: (v, other) => v === other,
  oneOf: (v, opts) => !v || opts.includes(v),
};

/** Default error messages */
const messages = {
  required: 'This field is required',
  email: 'Invalid email address',
  url: 'Invalid URL',
  phone: 'Invalid phone number',
  min: n => `Minimum ${n} characters`,
  max: n => `Maximum ${n} characters`,
  minValue: n => `Must be at least ${n}`,
  maxValue: n => `Must be at most ${n}`,
  pattern: 'Invalid format',
  match: 'Fields do not match',
  oneOf: opts => `Must be one of: ${opts.join(', ')}`,
};

/**
 * Validate a single value against rules
 * @param {*} value - Value to validate
 * @param {Object} rules - Validation rules { required: true, min: 2, email: true }
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validate(value, rules) {
  for (const [rule, param] of Object.entries(rules)) {
    if (param === false) continue;
    const check = validators[rule];
    if (!check) continue;
    const valid = param === true ? check(value) : check(value, param);
    if (!valid) {
      const msg = messages[rule];
      return { valid: false, error: typeof msg === 'function' ? msg(param) : msg };
    }
  }
  return { valid: true, error: null };
}

/**
 * Validate an object of fields
 * @param {Object} data - { username: 'john', email: 'john@test.com' }
 * @param {Object} schema - { username: { required: true, min: 2 }, email: { email: true } }
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validateAll(data, schema) {
  const errors = {};
  let valid = true;
  for (const [field, rules] of Object.entries(schema)) {
    const result = validate(data[field], rules);
    if (!result.valid) {
      valid = false;
      errors[field] = result.error;
    }
  }
  return { valid, errors };
}

/**
 * Create a reusable validator function for a schema
 * @param {Object} schema - Validation schema
 * @returns {(data: Object) => { valid: boolean, errors: Object }}
 */
export function createValidator(schema) {
  return data => validateAll(data, schema);
}

/**
 * Add a custom validator
 * @param {string} name - Validator name
 * @param {Function} fn - Validator function (value, param) => boolean
 * @param {string|Function} message - Error message
 */
export function addValidator(name, fn, message) {
  validators[name] = fn;
  messages[name] = message;
}

export default { validate, validateAll, createValidator, addValidator, patterns };
