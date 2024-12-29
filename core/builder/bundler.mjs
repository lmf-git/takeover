
import { writeFile } from 'fs/promises';

export async function createBundle(entry) {
    const bundle = `console.log('Bundle for ${entry}');`;
    await writeFile(`dist/${entry}.mjs`, bundle);
}

await createBundle('client');