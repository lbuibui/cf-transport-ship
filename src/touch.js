// 触屏控制：左侧虚拟摇杆移动，右侧滑动视角，按钮开火/跳/蹲/换弹/切枪/开镜
// 桌面客户端默认关闭（触摸屏笔记本会把主指针报成 coarse，不能用它判断）
export class TouchControls {
  constructor(game) {
    this.g = game;
    const qs = new URLSearchParams(location.search);
    this.enabled = qs.has('touch') || (!game.desktop && matchMedia('(pointer:coarse)').matches);
    if (!this.enabled) return;
    const root = document.getElementById('touch');
    root.classList.remove('hidden');
    const W = () => window.innerWidth;
    const pad = document.createElement('div'); pad.className = 'pad';
    const knob = document.createElement('div'); knob.className = 'pad';
    Object.assign(knob.style, { width: '56px', height: '56px', background: 'rgba(255,255,255,.25)', pointerEvents: 'none' });
    root.append(pad, knob);
    const buttons = [];
    const place = () => {
      Object.assign(pad.style, { left: '28px', bottom: '40px', width: '140px', height: '140px' });
      Object.assign(knob.style, { left: '70px', bottom: '82px' });
      for (const { el, pos, size } of buttons) {
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        el.style.left = pos.left === undefined ? '' : pos.left + 'px';
        el.style.right = pos.right === undefined ? '' : pos.right + 'px';
        el.style.bottom = pos.bottom + 'px';
      }
    };
    const btn = (label, pos, size, fn, up) => {
      const b = document.createElement('div'); b.className = 'btn'; b.textContent = label;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
      if (up) b.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
      root.appendChild(b);
      buttons.push({ el: b, pos, size });
      return b;
    };
    const P = () => this.g.player;
    // 右侧主开火；左侧 186px 处保留第二个开火键，左右拇指都能压枪。
    btn('开火', { right: 40, bottom: 150 }, 84, () => { const p = P(); if (p) { p.touch.fire = true; p.touch.firePressed = true; } }, () => { const p = P(); if (p) p.touch.fire = false; });
    btn('开火', { left: 186, bottom: 320 }, 64, () => { const p = P(); if (p) { p.touch.fire = true; p.touch.firePressed = true; } }, () => { const p = P(); if (p) p.touch.fire = false; });
    btn('跳', { right: 140, bottom: 60 }, 60, () => { const p = P(); if (p) p.touch.jump = true; });
    btn('蹲', { right: 210, bottom: 40 }, 54, () => { const p = P(); if (p) p.touch.crouch = !p.touch.crouch; });
    btn('R', { right: 40, bottom: 250 }, 50, () => { const p = P(); if (p) p.pressed.add('KeyR'); });
    btn('切', { right: 100, bottom: 250 }, 50, () => { const p = P(); if (p) p.pressed.add('KeyQ'); });
    btn('镜', { right: 40, bottom: 60 }, 60, () => { const p = P(); if (p) { p.mouse.rp = true; } });
    place();
    window.addEventListener('resize', place);
    // 摇杆
    let padId = null, cx = 0, cy = 0, lookId = null, lx = 0, ly = 0;
    window.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < W() * 0.4 && padId === null) { padId = t.identifier; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
        else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      const p = P();
      for (const t of e.changedTouches) {
        if (t.identifier === padId && p) {
          let dx = t.clientX - cx, dy = t.clientY - cy; const L = Math.hypot(dx, dy), m = 60;
          if (L > m) { dx *= m / L; dy *= m / L; }
          knob.style.left = (70 + dx) + 'px'; knob.style.bottom = (82 - dy) + 'px';
          p.touch.mx = dx / m; p.touch.mz = -dy / m;
        } else if (t.identifier === lookId && p) {
          p.touchLook = p.touchLook || { x: 0, y: 0 };
          p.touchLook.x += (t.clientX - lx) * 1.6; p.touchLook.y += (t.clientY - ly) * 1.6;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      const p = P();
      for (const t of e.changedTouches) {
        if (t.identifier === padId) { padId = null; knob.style.left = '70px'; knob.style.bottom = '82px'; if (p) { p.touch.mx = 0; p.touch.mz = 0; } }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
  }
}
