// Safe template functions for rendering HTML with expressions
// Uses safe property access instead of eval/Function to prevent code injection

// Safely access nested property from object using dot notation
function getNestedValue(obj, path) {
  if (!path || !obj) return undefined;
  return path.split('.').reduce((current, key) =>
    current && current[key] !== undefined ? current[key] : undefined, obj);
}

// Safe expression evaluator - handles property access and simple comparisons
function safeEvaluate(expression, props) {
  const trimmed = expression.trim();

  // Handle negation: !value or !obj.prop
  if (trimmed.startsWith('!')) {
    const inner = trimmed.slice(1).trim();
    return !safeEvaluate(inner, props);
  }

  // Handle comparison operators: ==, ===, !=, !==, >, <, >=, <=
  const comparisonMatch = trimmed.match(/^(.+?)\s*(===|==|!==|!=|>=|<=|>|<)\s*(.+)$/);
  if (comparisonMatch) {
    const [, left, operator, right] = comparisonMatch;
    const leftVal = safeEvaluate(left.trim(), props);
    const rightVal = safeEvaluate(right.trim(), props);

    switch (operator) {
      case '===': return leftVal === rightVal;
      case '==': return leftVal == rightVal;
      case '!==': return leftVal !== rightVal;
      case '!=': return leftVal != rightVal;
      case '>': return leftVal > rightVal;
      case '<': return leftVal < rightVal;
      case '>=': return leftVal >= rightVal;
      case '<=': return leftVal <= rightVal;
    }
  }

  // Handle logical operators: && and ||
  if (trimmed.includes('&&')) {
    const parts = trimmed.split('&&').map(p => p.trim());
    return parts.every(part => safeEvaluate(part, props));
  }
  if (trimmed.includes('||')) {
    const parts = trimmed.split('||').map(p => p.trim());
    return parts.some(part => safeEvaluate(part, props));
  }

  // Handle ternary operator: condition ? trueVal : falseVal
  const ternaryMatch = trimmed.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    const [, condition, trueVal, falseVal] = ternaryMatch;
    return safeEvaluate(condition.trim(), props)
      ? safeEvaluate(trueVal.trim(), props)
      : safeEvaluate(falseVal.trim(), props);
  }

  // Handle string literals: 'value' or "value"
  const stringMatch = trimmed.match(/^(['"])(.*)(\1)$/);
  if (stringMatch) {
    return stringMatch[2];
  }

  // Handle numeric literals
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Handle boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;

  // Handle array length: arr.length
  if (trimmed.endsWith('.length')) {
    const arrayPath = trimmed.slice(0, -7);
    const arr = getNestedValue(props, arrayPath);
    return Array.isArray(arr) ? arr.length : 0;
  }

  // Property access (including nested): obj.prop.subprop
  return getNestedValue(props, trimmed);
}

// Simple template replacement for basic {{variable}} patterns
export function render(template, props = {}) {
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, propName) => {
    const trimmedName = propName.trim();
    const value = getNestedValue(props, trimmedName);
    return value !== undefined ? value : match;
  });
}

// Full template rendering with expressions, conditionals, and loops
export function renderWithExpressions(template, props = {}) {
  let result = template;

  // Process outer #if blocks first (not nested inside #each)
  result = processOuterIfBlocks(result, props);

  // Process #each loops
  result = processEachBlocks(result, props);

  // Process remaining #if conditionals
  result = processIfBlocks(result, props);

  // Process regular expressions
  result = result.replace(/\{\{([^{}]+)\}\}/g, (match, expression) => {
    const trimmed = expression.trim();

    // Skip block helpers (already processed)
    if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
      return match;
    }

    const value = safeEvaluate(trimmed, props);
    return value !== undefined ? String(value) : match;
  });

  return result;
}

function processOuterIfBlocks(template, props) {
  // Find {{#if}} blocks that are NOT inside {{#each}} blocks
  const outerIfRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;

  return template.replace(outerIfRegex, (match, condition, ifContent, elseContent) => {
    // Skip if this block contains {{#each}} - we'll process it later
    if (ifContent.includes('{{#each}}')) {
      const conditionResult = safeEvaluate(condition.trim(), props);
      return conditionResult ? ifContent : elseContent;
    }

    return match; // Let processIfBlocks handle it later
  });
}

function processEachBlocks(template, props) {
  const eachRegex = /\{\{#each\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;

  return template.replace(eachRegex, (_match, arrayName, blockContent) => {
    const array = props[arrayName];
    if (!Array.isArray(array)) {
      return '';
    }

    return array.map((item, index) => {
      let itemContent = blockContent;

      // Process nested {{#if}} blocks within the item context
      itemContent = processNestedIfBlocks(itemContent, item, props);

      // Replace {{this}} with current item (JSON for objects, raw for primitives)
      itemContent = itemContent.replace(/\{\{this\}\}/g,
        typeof item === 'object' ? JSON.stringify(item) : String(item));

      // Replace {{@index}} with current index
      itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));

      // Replace {{item.property}} with item properties
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach(key => {
          const regex = new RegExp(`\\{\\{(this\\.)?${key}\\}\\}`, 'g');
          const value = item[key];
          itemContent = itemContent.replace(regex, value !== undefined ? String(value) : '');
        });
      }

      return itemContent;
    }).join('');
  });
}

function processNestedIfBlocks(template, itemContext, globalProps) {
  // Simple nested if regex (non-greedy)
  const nestedIfRegex = /\{\{#if\s+([^}]+)\}\}([^{]*?)(?:\{\{else\}\}([^{]*?))?\{\{\/if\}\}/g;

  return template.replace(nestedIfRegex, (_match, condition, ifContent, elseContent = '') => {
    // Create context with both item properties and global props
    const context = { ...globalProps, ...itemContext };
    const result = safeEvaluate(condition.trim(), context);
    return result ? ifContent : elseContent;
  });
}

function processIfBlocks(template, props) {
  // Process nested if blocks by working from innermost to outermost
  let result = template;
  let hasChanges = true;
  let iterations = 0;
  const maxIterations = 10;

  while (hasChanges && iterations < maxIterations) {
    hasChanges = false;
    iterations++;

    // Find the innermost {{#if}} block (no nested {{#if}} inside)
    const ifRegex = /\{\{#if\s+([^}]+)\}\}((?:(?!\{\{#if)[\s\S])*?)(?:\{\{else\}\}((?:(?!\{\{#if)[\s\S])*?))?\{\{\/if\}\}/;

    const match = ifRegex.exec(result);
    if (match) {
      hasChanges = true;
      const [fullMatch, condition, ifContent, elseContent = ''] = match;

      const conditionResult = safeEvaluate(condition.trim(), props);
      const replacement = conditionResult ? ifContent : elseContent;
      result = result.replace(fullMatch, replacement);
    }
  }

  return result;
}
