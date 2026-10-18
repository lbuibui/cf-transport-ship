// HUD 与菜单（DOM）
import { WEAPONS, PRIMARIES } from './weapons.js';
import { KEY_ACTIONS, DEFAULT_KEYS, keyLabel } from './keybinds.js';

const TEAM_CN = { BL: '潜伏者', GR: '保卫者' };
const $ = (s, r = document) => r.querySelector(s);

const HS_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="none" stroke="#ff4030" stroke-width="3"><circle cx="20" cy="20" r="11"/><path d="M20 2v10M20 28v10M2 20h10M28 20h10"/></g><circle cx="20" cy="20" r="3.5" fill="#ff4030"/></svg>`);
const WB_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="15" y="4" width="10" height="32" fill="#bbb"/><path d="M2 20h36" stroke="#ffd24a" stroke-width="3"/></svg>`);
const BADGE_SVG = (color, inner) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bg" cx="50%" cy="45%"><stop offset="0" stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="#1a0a00" stop-opacity=".9"/></radialGradient></defs><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="url(#bg)" stroke="#ffd24a" stroke-width="3"/>${inner}</svg>`;
const SKULL = `<g fill="#fff"><path d="M50 22c-14 0-24 9-24 22 0 8 4 13 9 16v9h30v-9c5-3 9-8 9-16 0-13-10-22-24-22z"/><rect x="40" y="66" width="4" height="8"/><rect x="48" y="66" width="4" height="8"/><rect x="56" y="66" width="4" height="8"/></g><circle cx="41" cy="45" r="6" fill="#3a1500"/><circle cx="59" cy="45" r="6" fill="#3a1500"/>`;
const CROSSHAIR_B = `<g fill="none" stroke="#fff" stroke-width="4"><circle cx="50" cy="50" r="20"/><path d="M50 18v14M50 68v14M18 50h14M68 50h14"/></g><circle cx="50" cy="50" r="5" fill="#ff3020"/>`;

const OPT_TEAMS = ['BL', 'GR'];
const OPT_SIZES = [4, 6, 8];
const OPT_DIFFS = ['easy', 'normal', 'hard', 'hell'];
const OPT_GOALS = [30, 50, 100];
const OPT_TODS = ['day', 'dusk'];
const OPT_QUALITIES = ['low', 'medium', 'high'];
const OPT_FRAME_CAPS = [0, 60, 120, 144];
const KEY_CODE = /^[A-Za-z0-9]{1,24}$/;

const numIn = (v, def, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

function validResolution(v) {
  if (v === 'auto') return true;
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(v);
  return !!m && +m[1] >= 800 && +m[1] <= 7680 && +m[2] >= 600 && +m[2] <= 4320;
}

// localStorage 可能留着旧版本或手改的值。逐项校验，坏值回落默认，
// 否则一个失效的主武器 id 就会让开局在 new WeaponState 处崩溃。
function sanitizeKeys(raw) {
  const keys = { ...DEFAULT_KEYS };
  if (!raw || typeof raw !== 'object') return keys;
  const used = new Set(Object.values(keys));
  for (const id of Object.keys(DEFAULT_KEYS)) {
    const code = raw[id];
    if (typeof code === 'string' && KEY_CODE.test(code) && !used.has(code)) {
      used.delete(keys[id]);
      keys[id] = code;
      used.add(code);
    }
  }
  return keys;
}

function sanitizeOpts(base, raw) {
  const o = { ...base, keys: { ...DEFAULT_KEYS } };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return o;
  if (OPT_TEAMS.includes(raw.team)) o.team = raw.team;
  if (PRIMARIES.includes(raw.primary)) o.primary = raw.primary;
  if (OPT_SIZES.includes(+raw.size)) o.size = +raw.size;
  if (OPT_DIFFS.includes(raw.diff)) o.diff = raw.diff;
  if (OPT_GOALS.includes(+raw.goal)) o.goal = +raw.goal;
  if (OPT_TODS.includes(raw.tod)) o.tod = raw.tod;
  if (OPT_QUALITIES.includes(raw.quality)) o.quality = raw.quality;
  if (raw.windowMode === 'window' || raw.windowMode === 'fullscreen') o.windowMode = raw.windowMode;
  if (validResolution(raw.resolution)) o.resolution = raw.resolution;
  o.sens = numIn(raw.sens, base.sens, 0.2, 3);
  o.fov = numIn(raw.fov, base.fov, 65, 100);
  o.vol = numIn(raw.vol, base.vol, 0, 1);
  o.frameCap = OPT_FRAME_CAPS.includes(+raw.frameCap) ? +raw.frameCap : 0;
  o.keys = sanitizeKeys(raw.keys);
  return o;
}

export class HUD {
  constructor(game) {
    this.g = game;
    this.root = $('#ui');
    this.root.innerHTML = TEMPLATE;
    this.el = {};
    for (const n of this.root.querySelectorAll('[id]')) this.el[n.id] = n;
    this.icons = {};
    this.feedItems = [];
    this.dmgDirs = [];
    this.hitT = 0; this.toastT = 0;
    this.slotsT = 0;
    this.radarCtx = this.el.radar.getContext('2d');
    const touch = matchMedia('(pointer:coarse)').matches;
    const base = { team: 'BL', primary: 'ak47', size: 6, diff: 'normal', goal: 50, tod: 'day', quality: touch && !this.g.desktop ? 'low' : 'high', sens: 1.0, fov: 78, vol: 0.8, windowMode: 'window', resolution: 'auto', frameCap: 0, keys: { ...DEFAULT_KEYS } };
    try {
      this.opts = sanitizeOpts(base, JSON.parse(localStorage.getItem('cf_transport_ship_opts') || '{}'));
      this.saveOpts(); // 把清洗结果写回，坏配置不会每次启动都重复触发
    } catch (e) {
      this.opts = sanitizeOpts(base, null);
    }
    this.buildMenu();
  }
  saveOpts() { try { localStorage.setItem('cf_transport_ship_opts', JSON.stringify(this.opts)); } catch (e) { /* 忽略 */ } }

  // ---------- 菜单 ----------
  buildMenu() {
    const o = this.opts;
    const segs = this.root.querySelectorAll('.seg[data-k]');
    for (const s of segs) {
      const k = s.dataset.k;
      for (const b of s.querySelectorAll('button')) {
        if (String(o[k]) === b.dataset.v) b.classList.add('on');
        b.addEventListener('click', () => {
          for (const x of s.querySelectorAll('button')) x.classList.remove('on');
          b.classList.add('on');
          o[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
          this.saveOpts();
          this.g.onOption?.(k, o[k]);
          this.g.audio?.playUI('click');
        });
      }
    }
    for (const sl of this.root.querySelectorAll('.slider[data-k]')) {
      const k = sl.dataset.k, inp = sl.querySelector('input'), sp = sl.querySelector('span');
      inp.value = o[k]; sp.textContent = (+o[k]).toFixed(k === 'fov' ? 0 : 2);
      inp.addEventListener('input', () => {
        o[k] = +inp.value; sp.textContent = (+inp.value).toFixed(k === 'fov' ? 0 : 2); this.saveOpts();
        this.g.onOption?.(k, o[k]);
      });
    }
    $('#btnStart').addEventListener('click', () => this.g.startMatch());
    $('#btnResume').addEventListener('click', () => this.g.resume());
    $('#btnQuit').addEventListener('click', () => this.g.quitToMenu());
    $('#btnAgain').addEventListener('click', () => this.g.startMatch());
    $('#btnMenu').addEventListener('click', () => this.g.quitToMenu());
    for (const c of this.root.querySelectorAll('#loadCards .card')) {
      c.addEventListener('click', () => {
        this.g.chooseLoadout(c.dataset.w);
        for (const x of this.root.querySelectorAll('#loadCards .card')) x.classList.toggle('on', x === c);
      });
    }
    $('#btnLoadClose').addEventListener('click', () => this.g.closeLoadout());
    if (matchMedia('(pointer:coarse)').matches && !this.g.desktop) $('#touchNote').classList.remove('hidden');
    if (this.g.desktop) this.buildDesktop();
    for (const a of this.root.querySelectorAll('#clinks a, .mlinks a'))
      a.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  setIcons(icons) {
    this.icons = icons;
    for (const c of this.root.querySelectorAll('#loadCards .card')) c.querySelector('img').src = icons[c.dataset.w] || '';
  }

  // ---------- 桌面客户端 ----------
  buildDesktop() {
    for (const e of this.root.querySelectorAll('.desk')) e.classList.remove('hidden');
    this.binding = null;
    this.keyReturn = 'menu';
    this.el.keyList.addEventListener('click', (e) => {
      const row = e.target.closest('.krow');
      if (row) this.startBind(row.dataset.a);
    });
    $('#btnKeys').addEventListener('click', () => this.openKeys());
    $('#btnKeys2').addEventListener('click', () => this.openKeys());
    $('#btnKeysDone').addEventListener('click', () => this.closeKeys());
    $('#btnKeysReset').addEventListener('click', () => { this.opts.keys = { ...DEFAULT_KEYS }; this.saveOpts(); this.renderKeys(); this.g.audio?.playUI('click'); });
    $('#btnQuitApp').addEventListener('click', () => { this.g.audio?.playUI('click'); this.g.quitApp(); });
    $('#btnLogs')?.addEventListener('click', () => this.g.shell?.openLogs());
    this.renderKeys();
  }
  setDesktopInfo(st) {
    if (!st) return;
    this.desktopInfo = st;
    const el = $('#deskNote');
    if (el) el.textContent = `桌面客户端 v${st.version} · Electron ${st.electron} · ${st.platform}`;
  }
  renderKeys() {
    const k = this.opts.keys;
    this.el.keyList.innerHTML = KEY_ACTIONS.map((a) => {
      const on = this.binding === a.id;
      return `<div class="krow${on ? ' on' : ''}" data-a="${a.id}"><span>${a.label}</span><kbd>${on ? '按下按键…' : keyLabel(k[a.id])}</kbd></div>`;
    }).join('');
  }
  startBind(id) {
    if (this.binding) this.stopBind();
    this.binding = id;
    this.renderKeys();
    this.g.audio?.playUI('click');
    this.onBindKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      const keys = this.opts.keys;
      if (e.code === 'Escape') { this.stopBind(); return; }
      if (e.code === 'Delete' || e.code === 'Backspace') keys[id] = DEFAULT_KEYS[id];
      else {
        const prev = keys[id];
        for (const other of Object.keys(keys)) if (keys[other] === e.code && other !== id) keys[other] = prev;
        keys[id] = e.code;
      }
      this.g.player?.keys.clear();
      if (this.g.player) this.g.player.pressed.clear();
      this.saveOpts();
      this.stopBind();
    };
    window.addEventListener('keydown', this.onBindKey, true);
  }
  stopBind() {
    if (this.onBindKey) window.removeEventListener('keydown', this.onBindKey, true);
    this.onBindKey = null; this.binding = null;
    this.renderKeys();
  }
  openKeys() {
    this.keyReturn = this.g.playing && this.g.paused ? 'pause' : 'menu';
    this.el.keys.classList.remove('hidden');
    this.renderKeys();
    this.g.audio?.playUI('click');
  }
  closeKeys() {
    this.stopBind();
    this.el.keys.classList.add('hidden');
    this.g.audio?.playUI('buy');
    this.show(this.keyReturn);
  }
  syncControls() {
    const o = this.opts;
    for (const s of this.root.querySelectorAll('.seg[data-k]')) for (const b of s.querySelectorAll('button')) b.classList.toggle('on', String(o[s.dataset.k]) === b.dataset.v);
    for (const sl of this.root.querySelectorAll('.slider[data-k]')) {
      const k = sl.dataset.k; sl.querySelector('input').value = o[k]; sl.querySelector('span').textContent = (+o[k]).toFixed(k === 'fov' ? 0 : 2);
    }
  }
  show(name) {
    if (name === 'menu' || name === 'pause') this.syncControls();
    for (const n of ['menu', 'pause', 'end', 'loadout', 'loading']) this.el[n].classList.toggle('hidden', n !== name);
    this.el.hud.classList.toggle('hidden', name === 'menu' || name === 'loading' || name === 'end');
  }
  loading(p, text) { this.el.loadBar.style.width = (p * 100).toFixed(0) + '%'; if (text) this.el.loadTxt.textContent = text; }

  // ---------- 局内 ----------
  update(dt, s) {
    const e = this.el;
    // 比分与时间
    e.sBL.textContent = s.score.BL; e.sGR.textContent = s.score.GR;
    const tl = Math.max(0, s.timeLeft), mm = (tl / 60) | 0, ss = (tl % 60) | 0;
    e.sTime.textContent = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
    e.sGoal.textContent = `团队竞技 · 目标 ${s.goal}`;
    e.tBL.classList.toggle('mine', s.myTeam === 'BL'); e.tGR.classList.toggle('mine', s.myTeam === 'GR');
    // 生命护甲
    e.hpVal.textContent = Math.max(0, Math.ceil(s.hp));
    e.arVal.textContent = Math.max(0, Math.ceil(s.armor));
    e.hpBox.classList.toggle('low', s.hp <= 30 && s.alive);
    // 弹药
    const w = s.weapon;
    if (w) {
      const d = w.def;
      e.wName.textContent = d.hudName;
      if (d.type === 'melee') { e.aMag.textContent = '∞'; e.aRes.textContent = ''; }
      else if (d.type === 'grenade') { e.aMag.textContent = w.mag; e.aRes.textContent = ''; }
      else { e.aMag.textContent = w.mag; e.aRes.textContent = '/ ' + w.reserve; }
      e.aMag.classList.toggle('low', d.mag > 1 && w.mag <= Math.ceil(d.mag * 0.2));
      if (this.icons[d.id] && e.wIcon.dataset.id !== d.id) { e.wIcon.src = this.icons[d.id]; e.wIcon.dataset.id = d.id; }
      e.aHint.textContent = w.reloading ? '换弹中…' : (d.mag > 1 && w.mag === 0 && w.reserve === 0 ? '弹药耗尽' : (d.mag > 1 && w.mag === 0 ? '按 R 换弹' : ''));
    }
    // 准星
    const showX = s.alive && !s.scoped && w && w.def.type !== 'sniper';
    e.cross.style.display = showX ? '' : 'none';
    if (showX) {
      const gap = 4 + s.spreadPx;
      e.cT.style.top = -(gap + 9) + 'px'; e.cB.style.top = gap + 'px';
      e.cL.style.left = -(gap + 9) + 'px'; e.cR.style.left = gap + 'px';
    }
    e.scope.classList.toggle('on', !!s.scoped && s.alive);
    // 命中标记
    if (this.hitT > 0) { this.hitT -= dt; e.hit.style.opacity = Math.min(1, this.hitT * 5); } else e.hit.style.opacity = 0;
    // 受击方向
    for (const d of this.dmgDirs) {
      d.t -= dt;
      const rel = d.ang - s.yaw;
      d.el.style.transform = `rotate(${-rel}rad)`;
      d.el.style.opacity = Math.max(0, Math.min(1, d.t));
      if (d.t <= 0) d.el.remove();
    }
    this.dmgDirs = this.dmgDirs.filter((d) => d.t > 0);
    // 击杀信息淡出
    const now = performance.now();
    this.feedItems = this.feedItems.filter((f) => { if (now - f.t > 7000) { f.el.remove(); return false; } return true; });
    // 提示
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.style.opacity = 0; }
    // 中央信息
    if (!s.alive && s.respawnIn > 0) {
      e.center.classList.remove('hidden');
      e.cBig.innerHTML = s.killedBy || '你阵亡了';
      e.cSmall.textContent = `${s.respawnIn.toFixed(1)} 秒后复活 · 按 B 更换武器`;
    } else e.center.classList.add('hidden');
    e.protect.textContent = s.protect > 0 && s.alive ? `出生保护 ${s.protect.toFixed(1)}s（开火即解除）` : '';
    e.nameTip.textContent = s.aimName || ''; e.nameTip.className = s.aimTeam || '';
    if (this.slotsT > 0) { this.slotsT -= dt; e.slots.style.opacity = Math.min(1, this.slotsT * 2); } else e.slots.style.opacity = 0;
  }
  slots(inv, cur) {
    const e = this.el.slots;
    e.innerHTML = '';
    ['主武器', '副武器', '近身', '投掷'].forEach((lab, i) => {
      const w = inv[i];
      if (!w) return;
      const d = document.createElement('div');
      d.className = 's' + (i === cur ? ' on' : '');
      d.innerHTML = `<span>${w.def.name}</span><img src="${this.icons[w.id] || ''}"><b>${i + 1}</b>`;
      e.appendChild(d);
    });
    this.slotsT = 2.2;
  }
  killFeed(k, v, wid, hs, wb, mine) {
    const d = document.createElement('div');
    d.className = 'kf' + (mine ? ' me' : '');
    const icon = this.icons[wid] ? `<img src="${this.icons[wid]}">` : `<span>[${WEAPONS[wid]?.name || wid}]</span>`;
    d.innerHTML = (k ? `<span class="k ${k.team}">${esc(k.name)}</span>` : '') + icon + (wb ? `<img class="hs" src="${WB_ICON}">` : '') + (hs ? `<img class="hs" src="${HS_ICON}">` : '') + `<span class="v ${v.team}">${esc(v.name)}</span>`;
    this.el.feed.prepend(d);
    this.feedItems.push({ el: d, t: performance.now() });
    while (this.feedItems.length > 6) { const f = this.feedItems.shift(); f.el.remove(); }
  }
  hitmarker(hs, kill) {
    this.el.hit.className = kill ? 'kill' : hs ? 'hs' : '';
    this.hitT = kill ? 0.45 : 0.22;
  }
  damageFrom(ang) {
    const d = document.createElement('div'); d.className = 'dd';
    this.el.dmgDirs.appendChild(d);
    this.dmgDirs.push({ el: d, ang, t: 1.4 });
  }
  badge(text, sub, headshot) {
    const b = this.el.badge;
    b.classList.remove('show'); void b.offsetWidth;
    b.querySelector('.ico').innerHTML = BADGE_SVG(headshot ? '#c0301a' : '#b8860b', headshot ? CROSSHAIR_B : SKULL);
    b.querySelector('.txt').textContent = text;
    b.querySelector('.sub').textContent = sub || '';
    b.classList.add('show');
  }
  toast(text, dur = 2.5) { const t = this.el.toast; t.innerHTML = text; t.style.opacity = 1; this.toastT = dur; }
  scoreboard(show, actors, myId, score) {
    this.el.board.classList.toggle('hidden', !show);
    if (!show) return;
    const rows = (team) => actors.filter((a) => a.team === team).sort((a, b) => b.stats.k - a.stats.k || a.stats.d - b.stats.d)
      .map((a) => `<tr class="${a.id === myId ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${esc(a.name)}</td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.hs}</td><td>${a.ping}</td></tr>`).join('');
    const tbl = (team) => `<table class="t${team}"><tr><th class="team">${TEAM_CN[team]} · ${score[team]}</th><th>击杀</th><th>死亡</th><th>爆头</th><th>延迟</th></tr>${rows(team)}</table>`;
    this.el.boardBody.innerHTML = `<div class="cols">${tbl('BL')}${tbl('GR')}</div>`;
  }
  endScreen(win, score, actors, myId) {
    this.show('end');
    const r = this.el.endRes;
    r.textContent = win === null ? '平局' : win ? '胜利' : '失败';
    r.className = 'res ' + (win ? 'win' : 'lose');
    this.el.endSc.textContent = `潜伏者 ${score.BL} : ${score.GR} 保卫者`;
    const mvp = [...actors].sort((a, b) => (b.stats.k * 2 - b.stats.d + b.stats.hs) - (a.stats.k * 2 - a.stats.d + a.stats.hs))[0];
    this.el.endMvp.textContent = mvp ? `MVP：${mvp.name}（${mvp.stats.k} 杀 / ${mvp.stats.hs} 爆头）` : '';
    const me = actors.find((a) => a.id === myId);
    const acc = me && me.stats.shots ? ((me.stats.hits / me.stats.shots) * 100).toFixed(1) : '0';
    this.el.endMe.textContent = me ? `你的战绩：${me.stats.k} 击杀 · ${me.stats.d} 死亡 · ${me.stats.hs} 爆头 · 命中率 ${acc}%` : '';
    const rows = (team) => actors.filter((a) => a.team === team).sort((a, b) => b.stats.k - a.stats.k)
      .map((a) => `<tr class="${a.id === myId ? 'me' : ''}"><td>${esc(a.name)}</td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.hs}</td></tr>`).join('');
    const tbl = (team) => `<table class="t${team}"><tr><th class="team">${TEAM_CN[team]}</th><th>击杀</th><th>死亡</th><th>爆头</th></tr>${rows(team)}</table>`;
    this.el.endTable.innerHTML = `<div class="cols">${tbl('BL')}${tbl('GR')}</div>`;
  }
  // ---------- 小地图 ----------
  buildRadar(world) {
    const S = 8; // px/m
    const W = 74 * S, H = 26 * S;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(70,80,84,0.95)'; x.fillRect(0, 0, W, H);
    const cols = [...world.colliders].filter((k) => k.solid && k.top > 0.3 && k.bottom < 2 && k.hx < 30 && k.tag !== 'deck').sort((a, b) => a.top - b.top);
    for (const k of cols) {
      if (k.bullet === 'pass' && k.mat !== 'mesh') continue;
      x.save();
      x.translate((k.x + 37) * S, (k.z + 13) * S);
      x.rotate(-k.yaw);
      const hgt = k.top;
      x.fillStyle = k.mat === 'mesh' ? 'rgba(200,200,190,.5)' : hgt > 4 ? '#1d2327' : hgt > 2 ? '#2d353a' : hgt > 1.3 ? '#3b454b' : '#56616a';
      x.fillRect(-k.hx * S, -k.hz * S, k.hx * 2 * S, k.hz * 2 * S);
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1;
      x.strokeRect(-k.hx * S, -k.hz * S, k.hx * 2 * S, k.hz * 2 * S);
      x.restore();
    }
    // 管道顶棚（二楼）用虚线表示
    x.strokeStyle = 'rgba(245,179,33,.35)'; x.setLineDash([6, 4]);
    x.strokeRect((-29.5 + 37) * S, (9.4 + 13) * S, 36.6 * S, 2.44 * S);
    x.strokeRect((29.5 - 36.6 + 37) * S, (-11.84 + 13) * S, 36.6 * S, 2.44 * S);
    this.radarImg = c; this.radarS = S;
  }
  drawRadar(me, actors, t) {
    const ctx = this.radarCtx, cv = this.el.radar;
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (!cw || !ch) return;
    const W = Math.round(cw * 1.5), H = Math.round(ch * 1.5);
    // 只在尺寸变化时重设画布；每帧赋值会重建 backing store。
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.clearRect(0, 0, W, H);
    if (!this.radarImg) return;
    const S = this.radarS, zoom = 0.55 * (W / 294);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(me.yaw);
    ctx.scale(zoom, zoom);
    ctx.translate(-(me.pos.x + 37) * S, -(me.pos.z + 13) * S);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.radarImg, 0, 0);
    ctx.globalAlpha = 1;
    for (const a of actors) {
      if (a === me) continue;
      const seen = a.team === me.team || (a.radarT > 0);
      if (!seen) continue;
      const px = (a.pos.x + 37) * S, pz = (a.pos.z + 13) * S;
      if (!a.alive) {
        if (a.team !== me.team || a.deadT > 5) continue;
        ctx.strokeStyle = '#9aa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - 8, pz - 8); ctx.lineTo(px + 8, pz + 8); ctx.moveTo(px + 8, pz - 8); ctx.lineTo(px - 8, pz + 8); ctx.stroke();
        continue;
      }
      ctx.fillStyle = a.team === me.team ? '#4fb0ff' : '#ff4a3a';
      if (a.team === me.team) {
        ctx.save(); ctx.translate(px, pz); ctx.rotate(-a.yaw);
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = Math.min(1, a.radarT);
        ctx.beginPath(); ctx.arc(px, pz, 9, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    // 自己
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 10); ctx.lineTo(W / 2 + 7, H / 2 + 8); ctx.lineTo(W / 2, H / 2 + 4); ctx.lineTo(W / 2 - 7, H / 2 + 8); ctx.closePath(); ctx.fill();
    // 视野扇形
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.45);
    g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, W * 0.45, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const PRIM_CARDS = PRIMARIES.map((id) => {
  const d = WEAPONS[id];
  const sub = { ak47: '潜伏者经典 · 伤害高', m4a1: '保卫者经典 · 稳定', awm: '一枪致命 · 需开镜', mp5: '射速快 · 移动灵活' }[id];
  return `<div class="card" data-w="${id}"><img alt=""><b>${d.name}</b><small>${d.realName} · ${d.caliber}</small><small class="sub">${sub}</small></div>`;
}).join('');

const TEMPLATE = `
<div id="hud" class="hidden">
  <div id="score">
    <div class="team bl" id="tBL"><span class="nm">潜伏者</span><span class="pts" id="sBL">0</span></div>
    <div class="mid"><div class="time" id="sTime">10:00</div><div class="goal" id="sGoal"></div></div>
    <div class="team gr" id="tGR"><span class="pts" id="sGR">0</span><span class="nm">保卫者</span></div>
  </div>
  <div id="radarWrap"><canvas id="radar"></canvas><div class="lbl">CF-运输船</div></div>
  <div id="feed"></div>
  <div id="vitals">
    <div class="vbox" id="hpBox"><div class="ic">✚</div><div class="val" id="hpVal">100</div></div>
    <div class="vbox" id="arBox"><div class="ic">⛨</div><div class="val" id="arVal">100</div></div>
  </div>
  <div id="slots"></div>
  <div id="ammo"><div class="wname" id="wName"></div><div class="row"><img class="wicon" id="wIcon" alt=""><span class="mag" id="aMag">30</span><span class="res" id="aRes">/ 90</span></div><div class="hint" id="aHint"></div></div>
  <div id="cross"><i class="t" id="cT"></i><i class="b" id="cB"></i><i class="l" id="cL"></i><i class="r" id="cR"></i></div>
  <div id="hit"><i></i><i></i><i></i><i></i></div>
  <div id="dmgDirs"></div>
  <div id="scope"><div class="ring"></div><div class="h"></div><div class="v"></div><div class="h2 l"></div><div class="h2 r"></div><div class="v2"></div><div class="dot"></div></div>
  <div id="badge"><div class="ico"></div><div class="txt"></div><div class="sub"></div></div>
  <div id="center" class="hidden"><div class="big" id="cBig"></div><div class="small" id="cSmall"></div></div>
  <div id="toast"></div>
  <div id="protect"></div>
  <div id="nameTip"></div>
  <div id="board" class="hidden tbl"><h3><span>CF-运输船 · 团队竞技</span><span>Tab</span></h3><div id="boardBody"></div></div>
  <div id="touch" class="hidden"></div>
</div>

<div id="loading" class="screen"><div class="t">CF-运输船</div><div class="s" id="loadTxt">LOADING</div><div class="bar"><i id="loadBar"></i></div><div class="tip">小提示：蹲下再跳（蹲跳）可以跳得更高，踩着木箱就能爬上对面集装箱的二楼。</div></div>

<div id="menu" class="screen hidden">
  <div class="menuBox">
    <div class="title">
      <div class="logo">TACTICAL · 团队竞技</div>
      <h1>CF-运输船</h1>
      <div class="en">TRANSPORT SHIP</div>
      <p>一艘停泊在近海的货轮被走私团伙控制。特遣队奉命登船突击检查，却遭到埋伏。<br>船头船尾两个船舱出生，中路 V 形斜放集装箱、两侧 L 形箱堆，左右各有一条只能从己方出生点进入的集装箱管道，管道顶上就是可以架枪的二楼。</p>
      <div class="keys">
        <kbd>W A S D</kbd><span>移动　<kbd>Shift</kbd> 静步　<kbd>空格</kbd> 跳　<kbd>C</kbd> 蹲</span>
        <kbd>鼠标左键</kbd><span>开火　<kbd>右键</kbd> 狙击开镜 / 刀重击</span>
        <kbd>1 2 3 4</kbd><span>主武器 / 手枪 / 刀 / 手雷　<kbd>Q</kbd> 快切　<kbd>滚轮</kbd> 切换</span>
        <kbd>R</kbd><span>换弹　<kbd>F</kbd> 检视武器　<kbd>B</kbd> 更换主武器</span>
        <kbd>Tab</kbd><span>计分板　<kbd>Esc</kbd> 暂停 / 设置</span>
      </div>
      <div class="note hidden" id="touchNote">检测到触屏设备：已启用虚拟摇杆（左侧移动、右侧滑动视角）。电脑 + 鼠标体验最佳。</div>
    </div>
    <div class="opts">
      <div class="opt"><div class="lab">阵营</div><div class="seg team" data-k="team"><button data-v="BL">潜伏者<small>Raiders</small></button><button data-v="GR">保卫者<small>Task Force</small></button></div></div>
      <div class="opt"><div class="lab">主武器</div><div class="seg" data-k="primary"><button data-v="ak47">AK-47</button><button data-v="m4a1">M4A1</button><button data-v="awm">AWM</button><button data-v="mp5">MP5</button></div></div>
      <div class="row2">
        <div class="opt"><div class="lab">对战规模</div><div class="seg" data-k="size"><button data-v="4">4v4</button><button data-v="6">6v6</button><button data-v="8">8v8</button></div></div>
        <div class="opt"><div class="lab">目标击杀</div><div class="seg" data-k="goal"><button data-v="30">30</button><button data-v="50">50</button><button data-v="100">100</button></div></div>
      </div>
      <div class="opt"><div class="lab">电脑难度</div><div class="seg" data-k="diff"><button data-v="easy">简单</button><button data-v="normal">普通</button><button data-v="hard">困难</button><button data-v="hell">地狱</button></div></div>
      <div class="row2">
        <div class="opt"><div class="lab">时间</div><div class="seg" data-k="tod"><button data-v="day">白天</button><button data-v="dusk">黄昏</button></div></div>
        <div class="opt"><div class="lab">画质</div><div class="seg" data-k="quality"><button data-v="low">流畅</button><button data-v="medium">均衡</button><button data-v="high">极致</button></div></div>
      </div>
      <div class="row3">
        <div class="opt"><div class="lab">灵敏度</div><div class="slider" data-k="sens"><input type="range" min="0.2" max="3" step="0.05"><span></span></div></div>
        <div class="opt"><div class="lab">视野 FOV</div><div class="slider" data-k="fov"><input type="range" min="65" max="100" step="1"><span></span></div></div>
        <div class="opt"><div class="lab">音量</div><div class="slider" data-k="vol"><input type="range" min="0" max="1" step="0.05"><span></span></div></div>
      </div>
      <div class="desk hidden">
        <div class="opt"><div class="lab">显示模式</div><div class="seg" data-k="windowMode"><button data-v="window">窗口</button><button data-v="fullscreen">全屏</button></div></div>
        <div class="row2">
          <div class="opt"><div class="lab">窗口分辨率</div><div class="seg" data-k="resolution"><button data-v="auto">默认</button><button data-v="1280x720">720p</button><button data-v="1600x900">900p</button><button data-v="1920x1080">1080p</button><button data-v="2560x1440">1440p</button></div></div>
          <div class="opt"><div class="lab">帧率上限</div><div class="seg" data-k="frameCap"><button data-v="0">无上限</button><button data-v="60">60</button><button data-v="120">120</button><button data-v="144">144</button></div></div>
        </div>
        <div class="row2">
          <div class="opt"><div class="lab">键位</div><button class="go sec" id="btnKeys">按 键 设 置</button></div>
          <div class="opt"><div class="lab">退出</div><button class="go sec" id="btnQuitApp">退 出 游 戏</button></div>
        </div>
        <div class="note" id="deskNote"></div>
      </div>
      <button class="go" id="btnStart">开 始 游 戏</button>
      <div class="note">点击开始后鼠标将被锁定，按 Esc 暂停。画质切换会重新加载页面。</div>
    </div>
  </div>
</div>

<div id="pause" class="screen hidden"><div class="pauseBox"><h2>暂停</h2>
  <div class="opt"><div class="lab">鼠标灵敏度</div><div class="slider" data-k="sens"><input type="range" min="0.2" max="3" step="0.05"><span></span></div></div>
  <div class="opt"><div class="lab">视野 FOV</div><div class="slider" data-k="fov"><input type="range" min="65" max="100" step="1"><span></span></div></div>
  <div class="opt"><div class="lab">音量</div><div class="slider" data-k="vol"><input type="range" min="0" max="1" step="0.05"><span></span></div></div>
  <div class="opt"><div class="lab">时间</div><div class="seg" data-k="tod"><button data-v="day">白天</button><button data-v="dusk">黄昏</button></div></div>
  <div class="desk hidden">
    <div class="opt"><div class="lab">显示模式</div><div class="seg" data-k="windowMode"><button data-v="window">窗口</button><button data-v="fullscreen">全屏</button></div></div>
    <div class="opt"><div class="lab">键位与日志</div><div class="row2"><button class="go sec" id="btnKeys2">按 键 设 置</button><button class="go sec" id="btnLogs">日 志 目 录</button></div></div>
  </div>
  <button class="go" id="btnResume">继 续</button><button class="go sec" id="btnQuit" style="margin-top:10px">退出到主菜单</button>
</div></div>

<div id="keys" class="screen hidden"><div class="pauseBox keysBox"><h2>按键设置</h2>
  <div class="keyList" id="keyList"></div>
  <div class="note">点击某一项，再按下新按键。Esc 取消，Delete 恢复该项默认。方向键与右 Shift 始终可用；数字 1-4 固定为主武器 / 手枪 / 刀 / 手雷。</div>
  <div class="row2" style="margin-top:12px"><button class="go" id="btnKeysDone">完 成</button><button class="go sec" id="btnKeysReset">全部恢复默认</button></div>
</div></div>

<div id="loadout" class="screen hidden"><div class="loadBox"><h2>更换主武器</h2><div class="sub">复活时生效；在出生点内立即生效。副武器沙漠之鹰、军刀、手雷自动配备。</div>
  <div class="cards" id="loadCards">${PRIM_CARDS}</div>
  <button class="go sec" id="btnLoadClose" style="margin-top:14px">确 定（B）</button>
</div></div>

<div id="end" class="screen hidden"><div class="endBox">
  <div class="res" id="endRes">胜利</div><div class="sc" id="endSc"></div><div class="mvp" id="endMvp"></div><div class="mvp" id="endMe" style="color:#dfe4e8"></div>
  <div id="endTable" class="tbl"></div>
  <div style="display:flex;gap:10px;margin-top:16px"><button class="go" id="btnAgain">再 来 一 局</button><button class="go sec" id="btnMenu">主菜单</button></div>
</div></div>
`;
