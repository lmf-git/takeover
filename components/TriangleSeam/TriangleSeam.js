const rng = (n, seed) => {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const generateSVG = (variant, seed, fromColor, toColor) => {
  const W = 1200;
  const H = 80;
  const variants = {
    wave:   { count: 14, jitter: 0.18, depth: 0.45 },
    sharp:  { count: 10, jitter: 0.22, depth: 0.75 },
    sparse: { count: 6,  jitter: 0.35, depth: 0.85 },
    fine:   { count: 22, jitter: 0.10, depth: 0.35 }
  };
  const cfg = variants[variant] || variants.wave;

  const points = [];
  for (let i = 0; i <= cfg.count; i++) {
    const x = (i / cfg.count) * W;
    const baseY = H / 2 + (i % 2 === 0 ? -H * cfg.depth / 2 : H * cfg.depth / 2);
    const jit = (rng(i, seed) - 0.5) * H * cfg.jitter;
    const y = Math.max(2, Math.min(H - 2, baseY + jit));
    points.push([x, y]);
  }
  points[0][1] = 0;
  points[points.length - 1][1] = H;

  const topRegion = `M0 0 L${W} 0 ` +
    points.slice().reverse().map(([x, y]) => `L${x} ${y}`).join(' ') + ' Z';
  const bottomRegion = `M0 ${H} ` +
    points.map(([x, y]) => `L${x} ${y}`).join(' ') + ` L${W} ${H} Z`;

  const triangles = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i + 1];
    const protrudeUp = p1[1] > p2[1];
    const apex = protrudeUp
      ? [(p1[0] + p2[0]) / 2, Math.min(p1[1], p2[1]) - H * 0.12]
      : [(p1[0] + p2[0]) / 2, Math.max(p1[1], p2[1]) + H * 0.12];
    if (rng(i + 100, seed) > 0.5) triangles.push({ p1, p2, apex, g: i % 4 });
  }

  const grads = [
    ['#68CBE9','0.55','#515DD1','0.15'],
    ['#846CE0','0.50','#306FBF','0.12'],
    ['#B985E9','0.48','#5CA6DF','0.14'],
    ['#79D1E5','0.52','#6958C2','0.14']
  ];

  const uid = Math.random().toString(36).slice(2, 8);

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}" style="display:block">
  <defs>
    ${grads.map(([c1,o1,c2,o2], i) => `<linearGradient id="sg${uid}${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}" stop-opacity="${o1}"/>
      <stop offset="1" stop-color="${c2}" stop-opacity="${o2}"/>
    </linearGradient>`).join('')}
  </defs>
  <path d="${topRegion}" fill="${fromColor}"/>
  <path d="${bottomRegion}" fill="${toColor}"/>
  ${triangles.map(tri => `<polygon points="${tri.p1[0]},${tri.p1[1]} ${tri.p2[0]},${tri.p2[1]} ${tri.apex[0]},${tri.apex[1]}" fill="url(#sg${uid}${tri.g})"/>`).join('')}
  <polyline points="${points.map(([x,y]) => `${x},${y}`).join(' ')}" fill="none" stroke="var(--line)" stroke-width="1" stroke-opacity="0.5"/>
</svg>`;
};

class TriangleSeam extends HTMLElement {
  connectedCallback() {
    const variant = this.getAttribute('variant') || 'wave';
    const seed = parseFloat(this.getAttribute('seed') || '0');
    const from = this.getAttribute('from-color') || 'var(--bg)';
    const to = this.getAttribute('to-color') || 'var(--bg-elev)';

    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.shadowRoot.innerHTML = `<style>:host{display:block;line-height:0;margin-top:-1px;margin-bottom:-1px}svg{display:block}</style>` +
      `<div aria-hidden="true">${generateSVG(variant, seed, from, to)}</div>`;
  }
}

customElements.define('triangle-seam', TriangleSeam);
