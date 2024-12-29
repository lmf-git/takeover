import { Readable } from 'stream';
import { createTemplate } from './template.js';

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
