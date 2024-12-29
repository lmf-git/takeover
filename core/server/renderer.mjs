import { Readable } from 'stream';
import { createTemplate } from './template.mjs';
import { createStyleTag } from './sass.mjs';

export class Renderer {
    static createStream(content, state = {}) {
        const template = createTemplate(content, state);
        return new Readable({
            read() {
                this.push(template);
                this.push(null);
            }
        });
    }

    static async renderToString(content, state = {}) {
        return createTemplate(content, state);
    }
}

export async function renderer(url, options = {}) {
    const { css, isStatic = false } = options;
    const styleTag = css ? createStyleTag(css) : '';
    const clientScript = isStatic ? '<script type="module" src="./client.js"></script>' : '<script type="module" src="/client.js"></script>';
    
    return `<!DOCTYPE html>
    <html>
        <head>
            <meta charset="UTF-8">
            ${styleTag}
            ${clientScript}
        </head>
        <body>
            <div id="app"></div>
        </body>
    </html>`;
}