// Simple template functions for rendering HTML with expressions

export function render(template, props = {}) {
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, propName) => {
    const trimmedName = propName.trim();
    return props.hasOwnProperty(trimmedName) ? props[trimmedName] : match;
  });
}

export function renderWithExpressions(template, props = {}) {
  const keys = Object.keys(props);
  const values = Object.values(props);
  
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, expression) => {
    try {
      const fn = new Function(...keys, `return ${expression.trim()};`);
      return fn(...values);
    } catch (error) {
      console.warn(`Failed to evaluate: ${expression}`, error);
      return match;
    }
  });
}
