import { Component, define } from '../../core/component.js';

const TREE = [
  { d: 0, name: 'takeover/', kind: 'root' },
  { d: 1, name: 'app/', kind: 'dir', note: 'file-system routed pages' },
  { d: 2, name: '_Layout/', kind: 'dir', note: 'root <app-layout>' },
  { d: 2, name: 'Home/', kind: 'route', note: '→ /' },
  { d: 2, name: 'About/', kind: 'route', note: '→ /about' },
  { d: 2, name: 'Dashboard/', kind: 'route', note: '→ /dashboard' },
  { d: 2, name: 'Login/', kind: 'route', note: '→ /login' },
  { d: 2, name: 'Users/[id]/User/', kind: 'route', note: '→ /users/:id/user' },
  { d: 2, name: 'NotFound/', kind: 'route', note: 'wildcard 404' },
  { d: 1, name: 'components/', kind: 'dir', note: 'auto-loaded via MutationObserver' },
  { d: 2, name: 'Counter/', kind: 'comp' },
  { d: 2, name: 'Navigation/', kind: 'comp' },
  { d: 2, name: 'Router/', kind: 'comp' },
  { d: 1, name: 'core/', kind: 'dir', note: 'the framework itself' },
  { d: 2, name: 'component.js', kind: 'file', note: 'base Component class' },
  { d: 2, name: 'context.js', kind: 'file', note: 'reactive store' },
  { d: 2, name: 'loader.js', kind: 'file', note: 'MutationObserver auto-loader' },
  { d: 2, name: 'routes.js', kind: 'file' },
  { d: 2, name: 'template.js', kind: 'file', note: '{{ expr }}, #if, #each' },
  { d: 2, name: 'server/', kind: 'dir' },
  { d: 3, name: 'index.js', kind: 'file', note: 'http + hmr' },
  { d: 3, name: 'bundle.js', kind: 'file', note: 'zero-dep ESM bundler' },
  { d: 3, name: 'minify.js', kind: 'file', note: 'js + css minifier' },
  { d: 3, name: 'ssr.js', kind: 'file' },
  { d: 3, name: 'ws.js', kind: 'file', note: 'WebSocket, no `ws` pkg' },
  { d: 1, name: 'lib/', kind: 'dir', note: 'public API' },
  { d: 2, name: 'i18n.js', kind: 'file' },
  { d: 2, name: 'nav.js', kind: 'file' },
  { d: 2, name: 'store.js', kind: 'file' },
  { d: 1, name: 'locales/', kind: 'dir' },
  { d: 2, name: 'en.json', kind: 'file' },
  { d: 2, name: 'es.json', kind: 'file' },
  { d: 2, name: 'fr.json', kind: 'file' },
  { d: 1, name: 'deploy/', kind: 'dir', note: 'edge targets' },
  { d: 2, name: 'cloudflare/_worker.js', kind: 'file' },
  { d: 2, name: 'netlify/', kind: 'dir' },
  { d: 1, name: 'globals.css', kind: 'file', note: 'tokens + reset' },
  { d: 1, name: 'index.html', kind: 'file', note: 'SSR shell' },
  { d: 1, name: 'package.json', kind: 'file', note: '"dependencies": {}' }
];

const COLORS = {
  root: 'var(--accent)',
  dir: 'var(--fg)',
  route: 'var(--lavender, oklch(0.72 0.12 300))',
  comp: 'var(--sky, oklch(0.72 0.14 240))',
  file: 'var(--fg-muted)'
};

export default class HomeStructure extends Component {
  static templateUrl = '/components/HomeStructure/HomeStructure.html';

  mount() {
    const body = this.$('#tree-body');
    if (!body) return;
    TREE.forEach(node => {
      const row = document.createElement('div');
      row.className = 'tree-row';
      row.style.paddingLeft = `${8 + node.d * 22}px`;
      row.style.color = COLORS[node.kind] || 'var(--fg)';
      row.innerHTML = `
        <span class="tree-name">
          <span class="tree-arrow">${node.kind === 'file' ? '·' : '▸'}</span>
          <span>${node.name}</span>
        </span>
        <span class="tree-dots" style="${node.note ? '' : 'opacity:0'}"></span>
        ${node.note ? `<span class="tree-note">${node.note}</span>` : ''}
      `;
      body.appendChild(row);
    });
  }
}

define('home-structure', HomeStructure);
