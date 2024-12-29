import { writeFile } from 'fs/promises';
import { createBundle } from './analyzer.js';

export async function createPageBundle(pagePath, outputDir) {
    const bundle = await createBundle([pagePath]);
    const moduleMap = new Map();
    
    let bundleCode = `
        const modules = new Map();
        const define = (id, deps, factory) => {
            modules.set(id, { deps, factory });
        };
        const require = (id) => {
            const module = modules.get(id);
            if (!module) throw new Error(\`Module \${id} not found\`);
            
            const exports = {};
            module.factory(require, exports);
            return exports;
        };
    `;

    for (const [path, deps] of bundle.entries()) {
        const id = createModuleId(path);
        moduleMap.set(path, id);
        
        bundleCode += `
            define("${id}", ${JSON.stringify(deps)}, 
                function(require, exports) {
                    ${await readFile(path, 'utf-8')}
                }
            );
        `;
    }

    const outputPath = `${outputDir}/${createModuleId(pagePath)}.js`;
    await writeFile(outputPath, bundleCode);
    return moduleMap;
}

function createModuleId(path) {
    return path.replace(/[^\w]/g, '_');
}
