import { Component, define } from '../../core/component.js';

export default class HomeDemos extends Component {
  static templateUrl = '/components/HomeDemos/HomeDemos.html';

  mount() {
    this.#initAuth();
    this.#initForm();
    this.#initRouter();
    this.#initAsync();
  }

  #e(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── Auth Demo ──────────────────────────────────────────────────────────
  #initAuth() {
    const root = this.$('#auth-body');
    if (!root) return;
    let user = null;

    const render = () => {
      if (user) {
        root.innerHTML = `
          <div style="padding:14px;border:1px solid var(--accent-line);background:var(--accent-dim);border-radius:var(--radius);display:flex;align-items:center;gap:12px;margin-bottom:14px">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--accent-grad);display:flex;align-items:center;justify-content:center;color:oklch(0.18 0.012 265);font-family:var(--font-mono);font-weight:600;font-size:14px;text-transform:uppercase">${user.username[0]}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500">${this.#e(user.username)}</div>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);overflow:hidden;text-overflow:ellipsis">${this.#e(user.email)}</div>
            </div>
            <span class="badge">${user.role}</span>
          </div>
          <div style="padding:12px;background:var(--bg);border:1px solid var(--line-soft);border-radius:var(--radius);font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);line-height:1.7;margin-bottom:12px">
            <div style="color:var(--fg-dim)">store.get('user') →</div>
            <div style="padding-left:12px;color:var(--sky)">{ username: '${this.#e(user.username)}', role: '${user.role}' }</div>
          </div>
          <button id="auth-logout" class="btn btn-ghost" style="width:100%;justify-content:center">store.logout()</button>
        `;
        root.querySelector('#auth-logout').addEventListener('click', () => { user = null; render(); });
      } else {
        root.innerHTML = `
          <form id="auth-form">
            <div class="demo-label">username</div>
            <input id="auth-user" type="text" placeholder="alice" autocomplete="off" class="demo-input" style="width:100%"/>
            <div class="demo-label" style="margin-top:14px">password</div>
            <input type="password" value="••••••••" class="demo-input" style="width:100%"/>
            <div id="auth-err" style="display:none;font-family:var(--font-mono);font-size:11px;color:oklch(0.72 0.16 25);margin-top:8px"></div>
            <button id="auth-submit" type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:14px">store.login()</button>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--fg-dim);margin-top:10px;text-align:center">try username <span style="color:var(--accent-soft)">alice</span></div>
          </form>
        `;
        const form = root.querySelector('#auth-form');
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const username = root.querySelector('#auth-user').value.trim();
          const err = root.querySelector('#auth-err');
          const btn = root.querySelector('#auth-submit');
          if (!username || username.length < 3) {
            err.textContent = '⚠ username must be at least 3 characters';
            err.style.display = '';
            return;
          }
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Authenticating…';
          await new Promise(r => setTimeout(r, 700));
          user = { username, role: 'admin', email: `${username}@takeover.dev` };
          render();
        });
      }
    };
    render();
  }

  // ── Form Demo ──────────────────────────────────────────────────────────
  #initForm() {
    const root = this.$('#form-body');
    if (!root) return;
    const v = { email: '', name: '', plan: 'pro' };
    const touched = { email: false, name: false };

    const validate = () => ({
      email: !v.email ? 'required' : (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email) ? 'invalid email format' : null),
      name:  !v.name  ? 'required' : (v.name.length < 2 ? 'too short' : null)
    });

    const planHtml = () => ['free','pro','team'].map(p => `<button type="button" class="plan-btn${v.plan===p?' active':''}" data-plan="${p}">${p}</button>`).join('');

    const render = (loading = false, success = false) => {
      if (success) {
        root.innerHTML = `<div style="min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="var(--accent-soft)" stroke-width="2"/><path d="M12 20l6 6 12-12" stroke="var(--accent-soft)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div style="font-family:var(--font-mono);font-size:12px;color:var(--accent-soft);letter-spacing:0.06em">this.emit('submit', data)</div>
        </div>`;
        return;
      }
      const err = validate();
      root.innerHTML = `
        <form id="form-demo">
          <div class="demo-label">email</div>
          <input id="form-email" class="demo-input${touched.email && err.email ? ' demo-input-error':''}" type="text" placeholder="you@example.com" autocomplete="off" value="${this.#e(v.email)}" style="width:100%"/>
          ${touched.email && err.email ? `<div class="field-error">⚠ ${err.email}</div>` : ''}
          <div class="demo-label" style="margin-top:12px">name</div>
          <input id="form-name" class="demo-input${touched.name && err.name ? ' demo-input-error':''}" type="text" placeholder="Alice Wong" autocomplete="off" value="${this.#e(v.name)}" style="width:100%"/>
          ${touched.name && err.name ? `<div class="field-error">⚠ ${err.name}</div>` : ''}
          <div class="demo-label" style="margin-top:12px">plan</div>
          <div style="display:flex;gap:6px;padding:3px;background:var(--bg);border:1px solid var(--line-soft);border-radius:var(--radius)">${planHtml()}</div>
          <button type="submit" ${loading?'disabled':''} class="btn btn-primary" style="width:100%;justify-content:center;margin-top:14px;${loading?'opacity:0.6':''}">
            ${loading ? '<span class="spinner"></span> validating…' : 'this.withLoading(submit)'}
          </button>
        </form>
        <style>.plan-btn{flex:1;border:0;background:transparent;color:var(--fg-muted);padding:7px 10px;font-family:var(--font-mono);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border-radius:3px;cursor:pointer;transition:all 140ms ease}.plan-btn.active{background:var(--accent-dim);color:var(--accent-soft)}</style>
      `;
      root.querySelector('#form-email').addEventListener('input', e => { v.email = e.target.value; });
      root.querySelector('#form-email').addEventListener('blur', () => { touched.email = true; render(); });
      root.querySelector('#form-name').addEventListener('input', e => { v.name = e.target.value; });
      root.querySelector('#form-name').addEventListener('blur', () => { touched.name = true; render(); });
      root.querySelectorAll('.plan-btn').forEach(btn => {
        btn.addEventListener('click', () => { v.plan = btn.dataset.plan; render(); });
      });
      root.querySelector('#form-demo').addEventListener('submit', async e => {
        e.preventDefault();
        touched.email = true; touched.name = true;
        if (validate().email || validate().name) { render(); return; }
        render(true);
        await new Promise(r => setTimeout(r, 800));
        render(false, true);
        setTimeout(() => { v.email=''; v.name=''; touched.email=false; touched.name=false; render(); }, 1600);
      });
    };
    render();
  }

  // ── Router Demo ────────────────────────────────────────────────────────
  #initRouter() {
    const root = this.$('#router-body');
    if (!root) return;
    let route = '/';
    let user = null;
    let log = [{ msg: "Router mounted at '/'", color: 'var(--fg-muted)' }];

    const ROUTES = [
      { path: '/', label: 'Home', protected: false },
      { path: '/about', label: 'About', protected: false },
      { path: '/dashboard', label: 'Dashboard', protected: true },
      { path: '/settings', label: 'Settings', protected: true }
    ];

    const navigate = to => {
      const target = ROUTES.find(r => r.path === to);
      if (target.protected && !user) {
        log = [...log.slice(-3), { msg: `beforeEach: '${to}' needs auth → /login`, color: 'oklch(0.74 0.16 30)' }];
        route = '/login';
      } else {
        log = [...log.slice(-3), { msg: `navigate('${to}')`, color: 'var(--accent-soft)' }];
        route = to;
      }
      render();
    };

    const render = () => {
      const routeBtns = ROUTES.map(r => `<button class="route-btn${route===r.path?' active':''}" data-path="${r.path}">${r.label}${r.protected?'🔒':''}</button>`).join('');
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;gap:4px;padding:4px;background:var(--bg);border:1px solid var(--line-soft);border-radius:var(--radius)">${routeBtns}</div>
          <div style="padding:12px 14px;background:var(--bg);border:1px solid var(--line-soft);border-radius:var(--radius);font-family:var(--font-mono);font-size:11px;line-height:1.7">
            ${log.map(l => `<div style="color:${l.color}">${this.#e(l.msg)}</div>`).join('')}
          </div>
          <button id="rtr-login" class="btn ${user?'btn-ghost':'btn-primary'}" style="width:100%;justify-content:center">${user ? 'store.logout()' : 'store.login() as alice'}</button>
        </div>
        <style>.route-btn{flex:1;border:0;background:transparent;color:var(--fg-muted);padding:7px 6px;font-family:var(--font-mono);font-size:11px;border-radius:3px;cursor:pointer;transition:all 140ms ease}.route-btn.active{background:var(--accent-dim);color:var(--accent-soft)}.route-btn:hover{color:var(--fg)}</style>
      `;
      root.querySelectorAll('.route-btn').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.path));
      });
      root.querySelector('#rtr-login').addEventListener('click', () => {
        if (user) {
          user = null;
          log = [...log.slice(-3), { msg: "store.logout()", color: 'var(--fg-muted)' }];
          route = '/';
        } else {
          user = { name: 'alice' };
          log = [...log.slice(-3), { msg: "store.login() → user set", color: 'var(--sky)' }];
          setTimeout(() => {
            log = [...log.slice(-3), { msg: "navigate('/dashboard')", color: 'var(--accent-soft)' }];
            route = '/dashboard';
            render();
          }, 400);
        }
        render();
      });
    };
    render();
  }

  // ── Async Demo ─────────────────────────────────────────────────────────
  #initAsync() {
    const root = this.$('#async-body');
    if (!root) return;
    let loading = false;
    let data = null;
    let events = [];

    const NAMES = ['Patagonian Toothfish','Grenadier','Squid','Hake','Pollock'];
    const mockFetch = async () => {
      loading = true; render();
      await new Promise(r => setTimeout(r, 900));
      data = { species: NAMES[Math.floor(Math.random()*NAMES.length)], weight: (Math.random()*500+100).toFixed(1), depth: Math.floor(Math.random()*1500+200) };
      events = [...events.slice(-4), { name: 'fetch:success', detail: data.species, at: Date.now() }];
      loading = false; render();
    };

    const render = () => {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="padding:14px;border:1px solid var(--line-soft);border-radius:var(--radius);background:var(--bg);min-height:90px;display:flex;align-items:center;justify-content:center">
            ${loading
              ? `<div style="display:flex;flex-direction:column;align-items:center;gap:8px"><span class="spinner" style="width:22px;height:22px"></span><span style="font-family:var(--font-mono);font-size:11px;color:var(--fg-dim)">fetching…</span></div>`
              : data
              ? `<div style="font-family:var(--font-mono);font-size:12px;line-height:1.8;color:var(--fg-muted)">
                  <div><span style="color:var(--fg-dim)">species:</span> <span style="color:var(--sky)">'${this.#e(data.species)}'</span></div>
                  <div><span style="color:var(--fg-dim)">weight:</span> <span style="color:var(--sky)">${data.weight} kg</span></div>
                  <div><span style="color:var(--fg-dim)">depth:</span> <span style="color:var(--sky)">${data.depth} m</span></div>
                </div>`
              : `<span style="font-family:var(--font-mono);font-size:11px;color:var(--fg-dim)">awaiting fetch…</span>`
            }
          </div>
          <button id="async-fetch" ${loading?'disabled':''} class="btn btn-primary" style="justify-content:center;width:100%;${loading?'opacity:0.6':''}">
            ${loading ? '<span class="spinner"></span> fetching…' : 'this.withLoading(fetch)'}
          </button>
          <div style="padding:10px 12px;border:1px solid var(--line-soft);border-radius:var(--radius);background:var(--bg);font-family:var(--font-mono);font-size:11px;line-height:1.8;min-height:60px">
            <div style="color:var(--fg-dim);margin-bottom:4px;letter-spacing:0.08em">EVENTS</div>
            ${events.length ? events.map((e, i) => `<div style="color:var(--accent-soft);opacity:${0.4 + (i/events.length)*0.6}">› this.emit('${e.name}'${e.detail ? `, '${this.#e(e.detail)}'` : ''})</div>`).join('') : `<div style="color:var(--fg-dim)">// no events yet</div>`}
          </div>
        </div>
      `;
      if (!loading) {
        root.querySelector('#async-fetch').addEventListener('click', mockFetch);
      }
    };
    render();
  }
}

define('home-demos', HomeDemos);
