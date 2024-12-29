import { writeFile } from 'fs/promises';
import * as sass from 'sass';

export async function compileSass(input, outPath) {
    const result = sass.compile(input, {
        style: 'compressed'
    });
    
    if (outPath) {
        await writeFile(outPath, result.css);
    }
    
    return result.css;
}

export function createStyleTag(css) {
    return `<style>${css}</style>`;
}
