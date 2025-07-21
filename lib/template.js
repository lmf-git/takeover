// Simple template functions for rendering HTML with expressions

export function render(template, props = {}) {
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, propName) => {
    const trimmedName = propName.trim();
    return props.hasOwnProperty(trimmedName) ? props[trimmedName] : match;
  });
}

export function renderWithExpressions(template, props = {}) {
  let result = template;
  
  // Process #each loops first
  result = processEachBlocks(result, props);
  
  // Process #if conditionals
  result = processIfBlocks(result, props);
  
  // Process regular expressions
  const keys = Object.keys(props);
  const values = Object.values(props);
  
  return result.replace(/\{\{([^{}]+)\}\}/g, (match, expression) => {
    try {
      const trimmed = expression.trim();
      
      // Skip block helpers (already processed)
      if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
        return match;
      }
      
      const fn = new Function(...keys, `return ${trimmed};`);
      return fn(...values);
    } catch (error) {
      console.warn(`Failed to evaluate: ${expression}`, error);
      return match;
    }
  });
}

function processEachBlocks(template, props) {
  const eachRegex = /\{\{#each\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;
  
  return template.replace(eachRegex, (match, arrayName, blockContent) => {
    try {
      const array = props[arrayName];
      if (!Array.isArray(array)) {
        console.warn(`${arrayName} is not an array for #each loop`);
        return '';
      }
      
      return array.map((item, index) => {
        let itemContent = blockContent;
        
        // Replace {{this}} with current item
        itemContent = itemContent.replace(/\{\{this\}\}/g, JSON.stringify(item));
        
        // Replace {{@index}} with current index
        itemContent = itemContent.replace(/\{\{@index\}\}/g, index);
        
        // Replace {{item.property}} with item properties
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(key => {
            const regex = new RegExp(`\\{\\{(this\\.)?${key}\\}\\}`, 'g');
            itemContent = itemContent.replace(regex, item[key]);
          });
        }
        
        return itemContent;
      }).join('');
      
    } catch (error) {
      console.warn(`Error processing #each block for ${arrayName}:`, error);
      return '';
    }
  });
}

function processIfBlocks(template, props) {
  const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
  
  return template.replace(ifRegex, (match, condition, ifContent, elseContent = '') => {
    try {
      const keys = Object.keys(props);
      const values = Object.values(props);
      
      const fn = new Function(...keys, `return ${condition.trim()};`);
      const result = fn(...values);
      
      return result ? ifContent : elseContent;
    } catch (error) {
      console.warn(`Error processing #if condition "${condition}":`, error);
      return '';
    }
  });
}
