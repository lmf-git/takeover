import { Component, define } from '../../core/component.js';

export default class HeroGrid extends Component {
  static templateUrl = '/components/HeroGrid/HeroGrid.html';

  mount() {
    const canvas = this.$('#grid-canvas');
    if (canvas) this.#startSonar(canvas);
  }

  #startSonar(canvas) {
    const ctx = canvas.getContext('2d');
    let raf, start;
    let W = 0, H = 0;

    const dpr = Math.min(devicePixelRatio, 2);
    // ResizeObserver delivers size async via the rendering steps, so we read it
    // without forcing a synchronous layout. The first callback fires after the
    // first layout completes, so initial sizing is "free."
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      W = width; H = height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    });
    ro.observe(canvas);
    this.signal.addEventListener('abort', () => ro.disconnect());

    const blips = [];
    const seedBlips = () => {
      blips.length = 0;
      for (let i = 0; i < 7; i++) {
        blips.push({
          x: 0.08 + Math.random() * 0.84,
          y: 0.10 + Math.random() * 0.80,
          size: 1 + Math.random() * 2.2,
        });
      }
    };
    seedBlips();

    const PING_INTERVAL = 4.5;
    const PING_DURATION = 11;
    const RADIUS_EXP = 0.85;
    const BLIP_FADE = 1.6;

    const draw = ts => {
      if (!start) start = ts;
      const t = (ts - start) * 0.001;

      // ResizeObserver hasn't fired yet — skip until canvas has dimensions
      // (otherwise d/maxR is 0/0 → NaN → invalid rgba color).
      if (W === 0 || H === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, W, H);

      const cx = W * 0.5;
      const cy = H * 0.42;
      const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.05;

      const cycle = (Math.sin(t * 0.12) + 1) * 0.5;
      const r = Math.round(43  + cycle * 113);
      const g = Math.round(120 + cycle * 72);
      const b = Math.round(157 + cycle * 47);

      const ringCount = Math.ceil(PING_DURATION / PING_INTERVAL) + 1;
      for (let i = 0; i < ringCount; i++) {
        const age = ((t - i * PING_INTERVAL) % PING_DURATION + PING_DURATION) % PING_DURATION;
        const p = age / PING_DURATION;
        const radius = Math.pow(p, RADIUS_EXP) * maxR;
        const a = Math.pow(1 - p, 1.7) * 0.55;
        if (a <= 0.01 || radius < 2) continue;

        ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        const innerA = a * 0.35;
        if (innerA > 0.02 && radius > 6) {
          ctx.strokeStyle = `rgba(${r + 50},${g + 30},${b + 20},${innerA})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Brief flash at the origin when a new ping spawns — replaces the
      // previously-permanent center dot, which read as a glitch.
      const sinceLastPing = t - Math.floor(t / PING_INTERVAL) * PING_INTERVAL;
      if (sinceLastPing < 0.5) {
        const flash = 1 - sinceLastPing / 0.5;
        const flashGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
        flashGrad.addColorStop(0, `rgba(190, 225, 240, ${0.4 * flash})`);
        flashGrad.addColorStop(1, `rgba(${r},${g},${b}, 0)`);
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      // Light each blip only when a sweep ring's leading edge crosses it.
      // For a blip at distance d, solve radius(age) = d → age = (d/maxR)^(1/RADIUS_EXP) * PING_DURATION.
      // The most recent ring to spawn before (t - ageHit) is the one that just passed.
      for (const blip of blips) {
        const x = blip.x * W;
        const y = blip.y * H;
        const d = Math.hypot(x - cx, y - cy);
        const ageHit = Math.pow(Math.min(1, d / maxR), 1 / RADIUS_EXP) * PING_DURATION;
        const lastSpawn = Math.floor((t - ageHit) / PING_INTERVAL) * PING_INTERVAL;
        const sinceHit = t - lastSpawn - ageHit;
        if (sinceHit < 0 || sinceHit > BLIP_FADE) continue;
        const intensity = Math.pow(1 - sinceHit / BLIP_FADE, 1.6);
        const a = intensity * 0.6;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, 16);
        grad.addColorStop(0, `rgba(${r + 70},${g + 40},${b + 25}, ${a})`);
        grad.addColorStop(1, `rgba(${r},${g},${b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(220, 240, 250, ${a * 0.85})`;
        ctx.beginPath();
        ctx.arc(x, y, blip.size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    this.signal.addEventListener('abort', () => cancelAnimationFrame(raf));
  }
}

define('hero-grid', HeroGrid);
