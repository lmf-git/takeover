// Simple template functions for rendering HTML with expressions

export function render(template, props = {}) {
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, propName) => {
    const trimmedName = propName.trim();
    return props.hasOwnProperty(trimmedName) ? props[trimmedName] : match;
  });
}

export function renderWithExpressions(template, props = {}) {
  console.log('🔧 Starting renderWithExpressions');
  console.log('Template contains {{#if}}:', template.includes('{{#if'));
  console.log('Template contains {{#each}}:', template.includes('{{#each'));
  
  let result = template;
  
  // Process outer #if blocks first (not nested inside #each)
  console.log('🔀 Processing outer if blocks...');
  result = processOuterIfBlocks(result, props);
  console.log('After outer if blocks, contains {{#if}}:', result.includes('{{#if'));
  
  // Process #each loops 
  console.log('🔄 Processing each blocks...');
  result = processEachBlocks(result, props);
  console.log('After each blocks, contains {{#if}}:', result.includes('{{#if'));
  
  // Process remaining #if conditionals
  console.log('🔀 Processing remaining if blocks...');
  result = processIfBlocks(result, props);
  console.log('After remaining if blocks, contains {{#if}}:', result.includes('{{#if'));
  
  // Process regular expressions
  const keys = Object.keys(props);
  const values = Object.values(props);
  
  result = result.replace(/\{\{([^{}]+)\}\}/g, (match, expression) => {
    try {
      const trimmed = expression.trim();
      
      // Skip block helpers (already processed)
      if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
        console.warn(`⚠️ Unprocessed block helper: ${match}`);
        return match;
      }
      
      const fn = new Function(...keys, `return ${trimmed};`);
      return fn(...values);
    } catch (error) {
      console.warn(`Failed to evaluate: ${expression}`, error);
      return match;
    }
  });
  
  console.log('🎯 Final result contains {{#if}}:', result.includes('{{#if'));
  return result;
}

function processOuterIfBlocks(template, props) {
  console.log('🔀 processOuterIfBlocks called');
  
  // Find {{#if}} blocks that are NOT inside {{#each}} blocks
  const outerIfRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
  
  return template.replace(outerIfRegex, (match, condition, ifContent, elseContent) => {
    // Skip if this block contains {{#each}} - we'll process it later
    if (ifContent.includes('{{#each}}')) {
      console.log(`📍 Found outer if block: condition="${condition}"`);
      
      try {
        const keys = Object.keys(props);
        const values = Object.values(props);
        
        console.log(`🎯 Evaluating outer condition: ${condition}`);
        const fn = new Function(...keys, `return ${condition.trim()};`);
        const conditionResult = fn(...values);
        
        console.log(`✅ Outer condition "${condition}" evaluated to:`, conditionResult);
        
        return conditionResult ? ifContent : elseContent;
      } catch (error) {
        console.warn(`Error processing outer #if condition "${condition}":`, error);
        return '';
      }
    }
    
    return match; // Let processIfBlocks handle it later
  });
}

function processEachBlocks(template, props) {
  console.log('🔄 processEachBlocks called');
  const eachRegex = /\{\{#each\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;
  
  return template.replace(eachRegex, (match, arrayName, blockContent) => {
    try {
      console.log(`📍 Found each block for: ${arrayName}`);
      const array = props[arrayName];
      if (!Array.isArray(array)) {
        console.warn(`${arrayName} is not an array for #each loop`);
        return '';
      }
      
      console.log(`📊 Processing ${array.length} items in ${arrayName}`);
      
      return array.map((item, index) => {
        let itemContent = blockContent;
        
        console.log(`🔸 Processing item ${index}:`, item);
        
        // Process nested {{#if}} blocks within the item context
        itemContent = processNestedIfBlocks(itemContent, item, props);
        
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

function processNestedIfBlocks(template, itemContext, globalProps) {
  console.log('🔸 Processing nested if blocks for item:', itemContext);
  
  // Simple nested if regex (non-greedy)
  const nestedIfRegex = /\{\{#if\s+([^}]+)\}\}([^{]*?)(?:\{\{else\}\}([^{]*?))?\{\{\/if\}\}/g;
  
  return template.replace(nestedIfRegex, (match, condition, ifContent, elseContent = '') => {
    try {
      console.log(`🔹 Nested if condition: "${condition}"`);
      
      // Create context with both item properties and global props
      const context = { ...globalProps, ...itemContext };
      const keys = Object.keys(context);
      const values = Object.values(context);
      
      const fn = new Function(...keys, `return ${condition.trim()};`);
      const result = fn(...values);
      
      console.log(`🔹 Nested condition "${condition}" evaluated to:`, result);
      
      return result ? ifContent : elseContent;
    } catch (error) {
      console.warn(`Error processing nested #if condition "${condition}":`, error);
      return '';
    }
  });
}

function processIfBlocks(template, props) {
  console.log('🔀 processIfBlocks called');
  console.log('Input template snippet:', template.substring(0, 200));
  
  // Process nested if blocks first by working from innermost to outermost
  let result = template;
  let hasChanges = true;
  let iterations = 0;
  const maxIterations = 10;
  
  while (hasChanges && iterations < maxIterations) {
    hasChanges = false;
    iterations++;
    
    console.log(`🔁 If processing iteration ${iterations}`);
    
    // Find the innermost {{#if}} block (no nested {{#if}} inside)
    const ifRegex = /\{\{#if\s+([^}]+)\}\}((?:(?!\{\{#if)[\s\S])*?)(?:\{\{else\}\}((?:(?!\{\{#if)[\s\S])*?))?\{\{\/if\}\}/;
    
    const match = ifRegex.exec(result);
    if (match) {
      hasChanges = true;
      const [fullMatch, condition, ifContent, elseContent = ''] = match;
      
      console.log(`📍 Found if block: condition="${condition}"`);
      console.log(`📍 If content: "${ifContent.substring(0, 50)}..."`);
      console.log(`📍 Else content: "${elseContent.substring(0, 50)}..."`);
      
      try {
        const keys = Object.keys(props);
        const values = Object.values(props);
        
        console.log(`🎯 Evaluating condition with props:`, props);
        
        const fn = new Function(...keys, `return ${condition.trim()};`);
        const conditionResult = fn(...values);
        
        console.log(`✅ Condition "${condition}" evaluated to:`, conditionResult);
        
        const replacement = conditionResult ? ifContent : elseContent;
        result = result.replace(fullMatch, replacement);
        
        console.log(`🔄 Replaced with: "${replacement.substring(0, 50)}..."`);
      } catch (error) {
        console.warn(`Error processing #if condition "${condition}":`, error);
        result = result.replace(fullMatch, '');
      }
    } else {
      console.log('🚫 No if blocks found in this iteration');
    }
  }
  
  console.log('🎯 processIfBlocks finished');
  return result;
}
