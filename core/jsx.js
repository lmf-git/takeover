export function h(tag, props, ...children) {
    if (typeof tag === 'function') {
        return tag(props, children);
    }

    const flatChildren = children.flat().filter(child => child !== null && child !== undefined);
    const attrs = props ? Object.entries(props)
        .filter(([key]) => key !== 'children')
        .map(([key, value]) => {
            if (key.startsWith('on')) {
                return `${key.toLowerCase()}="${value}"`;
            }
            return `${key}="${value}"`;
        })
        .join(' ') : '';

    return `<${tag}${attrs ? ' ' + attrs : ''}>${flatChildren.join('')}</${tag}>`;
}

export function Fragment(props, children) {
    return children.join('');
}
