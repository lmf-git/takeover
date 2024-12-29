export function h(type, props, ...children) {
    if (typeof type === 'function') {
        return type(props);
    }

    const element = document.createElement(type);

    if (props) {
        Object.entries(props || {}).forEach(([name, value]) => {
            if (name === 'className') {
                element.setAttribute('class', value);
            } else if (name.startsWith('on')) {
                element.addEventListener(name.toLowerCase().slice(2), value);
            } else {
                element.setAttribute(name, value);
            }
        });
    }

    children.flat().forEach(child => {
        if (typeof child === 'string' || typeof child === 'number') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    });

    return element;
}
