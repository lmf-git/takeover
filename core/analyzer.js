import { readFile } from 'fs/promises';
import { parse } from 'acorn';
import { walk } from 'acorn-walk';

export async function analyzeDependencies(entryPath, visited = new Set()) {
    if (visited.has(entryPath)) return [];
    visited.add(entryPath);

    const content = await readFile(entryPath, 'utf-8');
    const ast = parse(content, { sourceType: 'module', ecmaVersion: 'latest' });
    const imports = [];

    walk.simple(ast, {
        ImportDeclaration(node) {
            imports.push(node.source.value);
        },
        CallExpression(node) {
            if (node.callee.type === 'Import') {
                imports.push(node.arguments[0].value);
            }
        }
    });

    return imports;
}

export async function createBundle(entries, outputPath) {
    const modules = new Map();
    const pending = [...entries];

    while (pending.length > 0) {
        const current = pending.pop();
        const deps = await analyzeDependencies(current);
        modules.set(current, deps);
        pending.push(...deps.filter(dep => !modules.has(dep)));
    }

    return modules;
}
