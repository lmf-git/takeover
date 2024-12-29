import { writeFile, mkdir } from 'fs/promises';
import { Router } from '../client/router.js';
import { Renderer } from '../server/renderer.js';
import { compileSass } from '../server/sass.mjs';
import { createPageBundle } from './bundler.js';

export async function build(routes, options = {}) {
    const { outDir = './dist', styleFile } = options;
    const router = new Router();
    const bundles = new Map();
    
    // Create output directory
    await mkdir(outDir, { recursive: true });
    await mkdir(`${outDir}/pages`, { recursive: true });

    // Create page bundles with JSG support
    for (const [path, component] of Object.entries(routes)) {
        const componentPath = component.file || component.toString();
        const bundle = await createPageBundle(componentPath, `${outDir}/pages`);
        bundles.set(path, bundle);
        router.add(path, () => import(`${componentPath}`)); // Dynamic import
    }

    // Compile SASS if provided
    let css = '';
    if (styleFile) {
        css = await compileSass(styleFile, `${outDir}/styles.css`);
    }

    // Build each route
    for (const [path, _] of routes) {
        const content = await router.render(path);
        const bundle = bundles.get(path);
        const html = await Renderer.renderToString(content, { bundle }, css);
        const filePath = path === '/' ? '/index.html' : `${path}.html`;
        await writeFile(`${outDir}${filePath}`, html);
    }
}
