/**
 * Simple template renderer that replaces {{prop}} placeholders with values
 * @param {string} template - HTML template string
 * @param {Object} props - Properties to inject
 * @returns {string} - Rendered HTML
 */
export function render(template, props = {}) {
  // Replace all {{propName}} with the actual prop values
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, propName) => {
    const trimmedName = propName.trim();
    return props.hasOwnProperty(trimmedName) 
      ? props[trimmedName] 
      : match; // Keep original if prop not found
  });
}

/**
 * Enhanced renderer that also supports expressions like {{count + 1}}
 * @param {string} template - HTML template string
 * @param {Object} props - Properties to inject
 * @returns {string} - Rendered HTML
 */
export function renderWithExpressions(template, props = {}) {
  // Create a function context with props as arguments
  const keys = Object.keys(props);
  const values = Object.values(props);
  
  // Replace all {{expression}} with evaluated expressions
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, expression) => {
    try {
      // Create a function with props as parameters that returns the evaluated expression
      const fn = new Function(...keys, `return ${expression.trim()};`);
      return fn(...values);
    } catch (error) {
      console.warn(`Failed to evaluate expression: ${expression}`, error);
      return match; // Keep original on error
    }
  });
}
