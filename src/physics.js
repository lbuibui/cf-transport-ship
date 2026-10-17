// 碰撞世界：所有静态碰撞体都是绕 Y 轴旋转的 OBB
// 约定：three.js rotation.y = yaw，local->world: (x,z) -> (c*x + s*z, -s*x + c*z)

export class Collider {
  constructor(o) {
    this.x = o.x; this.y = o.y; this.z = o.z; // 中心
    this.hx = o.sx / 2; this.hy = o.sy / 2; this.hz = o.sz / 2;
    this.yaw = o.yaw || 0;
    this.c = Math.cos(this.yaw); this.s = Math.sin(this.yaw);
    this.mat = o.mat || 'metal';            // 命中材质：metal | wood | mesh | concrete
    this.solid = o.solid !== false;         // 是否阻挡移动
    this.bullet = o.bullet || 'block';      // block | pass | pen(可穿透)
    this.sight = o.sight !== false;         // 是否阻挡视线
    this.surface = o.surface || (this.mat === 'wood' ? 'wood' : 'metal'); // 脚步声
    this.top = this.y + this.hy; this.bottom = this.y - this.hy;
    const ex = Math.abs(this.c) * this.hx + Math.abs(this.s) * this.hz;
    const ez = Math.abs(this.s) * this.hx + Math.abs(this.c) * this.hz;
    this.minX = this.x - ex; this.maxX = this.x + ex;
    this.minZ = this.z - ez; this.maxZ = this.z + ez;
    this.stamp = 0;
    this.tag = o.tag || '';
  }
  // 世界 -> 局部（XZ）
  toLocal(wx, wz) {
    const dx = wx - this.x, dz = wz - this.z;
    return [this.c * dx - this.s * dz, this.s * dx + this.c * dz];
  }
  toWorldDir(lx, lz) { return [this.c * lx + this.s * lz, -this.s * lx + this.c * lz]; }
}

const CELL = 4;

export class World {
  constructor() {
    this.colliders = [];
    this.grid = new Map();
    this.stamp = 1;
  }
  add(o) {
    const c = o instanceof Collider ? o : new Collider(o);
    this.colliders.push(c);
    return c;
  }
  build() {
    this.grid.clear();
    for (const c of this.colliders) {
      const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
      const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x * 1000 + z;
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(c);
      }
    }
  }
  // 返回本次查询独占的数组。调用方可以在遍历结果时再次查询，
  // 不会再像共享缓冲区那样被内层 query 清空。
  query(minX, minZ, maxX, maxZ) {
    const out = [];
    const st = ++this.stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const arr = this.grid.get(x * 1000 + z);
      if (!arr) continue;
      for (const c of arr) {
        if (c.stamp === st) continue;
        c.stamp = st;
        if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
        out.push(c);
      }
    }
    return out;
  }

  // 射线 vs 单个 OBB，返回 t 与局部法线
  static rayOBB(c, ox, oy, oz, dx, dy, dz, maxT, res) {
    const rx = ox - c.x, rz = oz - c.z;
    const lox = c.c * rx - c.s * rz, loz = c.s * rx + c.c * rz, loy = oy - c.y;
    const ldx = c.c * dx - c.s * dz, ldz = c.s * dx + c.c * dz, ldy = dy;
    let tmin = 0, tmax = maxT, axis = -1, sign = 0;
    // X
    if (Math.abs(ldx) < 1e-9) { if (lox < -c.hx || lox > c.hx) return false; }
    else {
      let t1 = (-c.hx - lox) / ldx, t2 = (c.hx - lox) / ldx, sg = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sg = 1; }
      if (t1 > tmin) { tmin = t1; axis = 0; sign = sg; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    if (Math.abs(ldy) < 1e-9) { if (loy < -c.hy || loy > c.hy) return false; }
    else {
      let t1 = (-c.hy - loy) / ldy, t2 = (c.hy - loy) / ldy, sg = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sg = 1; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = sg; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    if (Math.abs(ldz) < 1e-9) { if (loz < -c.hz || loz > c.hz) return false; }
    else {
      let t1 = (-c.hz - loz) / ldz, t2 = (c.hz - loz) / ldz, sg = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sg = 1; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = sg; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    if (axis < 0) { // 起点在盒内
      res.t = 0; res.exit = tmax; res.nx = -dx; res.ny = -dy; res.nz = -dz; return true;
    }
    res.t = tmin; res.exit = tmax;
    let lnx = 0, lny = 0, lnz = 0;
    if (axis === 0) lnx = sign; else if (axis === 1) lny = sign; else lnz = sign;
    res.nx = c.c * lnx + c.s * lnz; res.ny = lny; res.nz = -c.s * lnx + c.c * lnz;
    return true;
  }

  // 射线检测。filter: 'move' | 'bullet' | 'sight'
  // 返回最近命中 {t, nx,ny,nz, collider, exit}
  raycast(ox, oy, oz, dx, dy, dz, maxT, mode = 'bullet', out = {}) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const cands = this.query(Math.min(ox, ex) - 0.1, Math.min(oz, ez) - 0.1, Math.max(ox, ex) + 0.1, Math.max(oz, ez) + 0.1);
    let best = maxT, hit = null;
    const r = this._r || (this._r = {});
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (mode === 'bullet' && c.bullet === 'pass') continue;
      if (mode === 'sight' && !c.sight) continue;
      if (mode === 'move' && !c.solid) continue;
      if (World.rayOBB(c, ox, oy, oz, dx, dy, dz, best, r) && r.t < best) {
        best = r.t; hit = c;
        out.nx = r.nx; out.ny = r.ny; out.nz = r.nz; out.exit = r.exit;
      }
    }
    if (!hit) return null;
    out.t = best; out.collider = hit;
    return out;
  }

  // 返回沿射线所有命中（按 t 排序），用于穿透
  raycastAll(ox, oy, oz, dx, dy, dz, maxT) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const cands = this.query(Math.min(ox, ex) - 0.1, Math.min(oz, ez) - 0.1, Math.max(ox, ex) + 0.1, Math.max(oz, ez) + 0.1);
    const hits = [];
    const r = {};
    for (const c of cands) {
      if (c.bullet === 'pass') continue;
      if (World.rayOBB(c, ox, oy, oz, dx, dy, dz, maxT, r)) hits.push({ t: r.t, exit: r.exit, nx: r.nx, ny: r.ny, nz: r.nz, collider: c });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  // 圆（XZ）与 OBB 的最近点关系
  static circleOBB(c, px, pz, r, out) {
    const [lx, lz] = c.toLocal(px, pz);
    const qx = Math.max(-c.hx, Math.min(c.hx, lx));
    const qz = Math.max(-c.hz, Math.min(c.hz, lz));
    const dx = lx - qx, dz = lz - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      const [wx, wz] = c.toWorldDir(dx / d, dz / d);
      out.nx = wx; out.nz = wz; out.pen = r - d;
    } else {
      const px2 = c.hx - Math.abs(lx), pz2 = c.hz - Math.abs(lz);
      let lnx = 0, lnz = 0, pen;
      if (px2 < pz2) { lnx = lx >= 0 ? 1 : -1; pen = px2 + r; } else { lnz = lz >= 0 ? 1 : -1; pen = pz2 + r; }
      const [wx, wz] = c.toWorldDir(lnx, lnz);
      out.nx = wx; out.nz = wz; out.pen = pen;
    }
    return true;
  }

  // 判断胶囊空间是否被占用（用于站起/上台阶检查）
  blocked(px, py, pz, r, h) {
    const cands = this.query(px - r, pz - r, px + r, pz + r);
    const o = {};
    for (const c of cands) {
      if (!c.solid) continue;
      if (c.top <= py + 0.001 || c.bottom >= py + h - 0.001) continue;
      if (World.circleOBB(c, px, pz, r, o)) return true;
    }
    return false;
  }

  // 脚下最高支撑面（top <= maxY），返回 {y, collider}
  support(px, pz, r, maxY) {
    const cands = this.query(px - r, pz - r, px + r, pz + r);
    let best = -Infinity, bc = null;
    const o = {};
    for (const c of cands) {
      if (!c.solid) continue;
      if (c.top > maxY || c.top <= best) continue;
      if (World.circleOBB(c, px, pz, r, o)) { best = c.top; bc = c; }
    }
    return bc ? { y: best, collider: bc } : null;
  }

  // 角色移动：ent {pos:{x,y,z}(脚底), vel, radius, height, onGround, stepHeight}
  move(ent, dt) {
    const vx = ent.vel.x, vy = ent.vel.y, vz = ent.vel.z;
    const dist = Math.hypot(vx, vy, vz) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.12));
    const h = dt / n;
    const o = {};
    const r = ent.radius;
    let landed = false, landSpeed = 0;
    for (let s = 0; s < n; s++) {
      const p = ent.pos;
      // 水平
      p.x += ent.vel.x * h; p.z += ent.vel.z * h;
      for (let it = 0; it < 3; it++) {
        const cands = this.query(p.x - r, p.z - r, p.x + r, p.z + r);
        let any = false;
        for (const c of cands) {
          if (!c.solid) continue;
          const head = p.y + ent.height;
          if (c.top <= p.y + 0.001 || c.bottom >= head - 0.001) continue;
          if (!World.circleOBB(c, p.x, p.z, r, o)) continue;
          // 上台阶
          const rise = c.top - p.y;
          if (ent.onGround && rise > 0 && rise <= ent.stepHeight && !this.blocked(p.x, c.top, p.z, r * 0.95, ent.height)) {
            p.y = c.top; ent.stepped = (ent.stepped || 0) + rise; any = true; continue;
          }
          p.x += o.nx * (o.pen + 0.0005); p.z += o.nz * (o.pen + 0.0005);
          const vn = ent.vel.x * o.nx + ent.vel.z * o.nz;
          if (vn < 0) { ent.vel.x -= o.nx * vn; ent.vel.z -= o.nz * vn; }
          any = true;
        }
        if (!any) break;
      }
      // 垂直
      const prevY = p.y;
      p.y += ent.vel.y * h;
      if (ent.vel.y <= 0) {
        const probeUp = ent.onGround ? ent.stepHeight : 0.001;
        const sup = this.support(p.x, p.z, r * 0.92, prevY + 0.001);
        const snap = ent.onGround && ent.vel.y <= 0.01 ? Math.max(0.3, -ent.vel.y * h) : 0;
        if (sup && p.y <= sup.y + snap) {
          if (!ent.onGround) { landed = true; landSpeed = -ent.vel.y; }
          p.y = sup.y; ent.vel.y = 0; ent.onGround = true; ent.ground = sup.collider;
        } else {
          ent.onGround = false; ent.ground = null;
        }
        void probeUp;
      } else {
        ent.onGround = false; ent.ground = null;
        // 顶头
        const cands = this.query(p.x - r, p.z - r, p.x + r, p.z + r);
        for (const c of cands) {
          if (!c.solid) continue;
          const headPrev = prevY + ent.height, head = p.y + ent.height;
          if (c.bottom >= headPrev - 0.01 && c.bottom < head && World.circleOBB(c, p.x, p.z, r * 0.9, o)) {
            p.y = c.bottom - ent.height - 0.001; ent.vel.y = 0;
          }
        }
      }
    }
    ent.landed = landed; ent.landSpeed = landSpeed;
  }
}

// ============== 多层表面图 + 跳跃链接 ==============
// 节点 = 格子中心 + 可站立高度。相邻格之间按高差连边：
//   0.45m 以内走上去，1.68m 以内跳上去，3.4m 以内可以落下。
const STEP_UP = 0.45;
const JUMP_UP = 1.68;
const DROP_DOWN = 3.4;

export class SurfaceNav {
  constructor(world, x0, z0, x1, z1, cell, agentR) {
    this.world = world;
    this.x0 = x0; this.z0 = z0; this.cell = cell; this.agentR = agentR;
    this.w = Math.ceil((x1 - x0) / cell); this.h = Math.ceil((z1 - z0) / cell);
    const n = this.w * this.h;
    this.cellNodes = new Array(n);
    for (let i = 0; i < n; i++) this.cellNodes[i] = [];
    this.nodeCell = []; this.nodeX = []; this.nodeZ = []; this.nodeH = [];

    // 每格候选高度：甲板 0 + 覆盖该格的可站立碰撞体顶面
    const cand = new Array(n);
    for (let i = 0; i < n; i++) cand[i] = [0];
    const o = {};
    for (const c of world.colliders) {
      if (!c.solid || c.top < 0.3 || c.top > 5.3) continue;
      if (Math.min(c.hx, c.hz) * 2 < 0.4) continue;
      const i0 = Math.floor((c.minX - x0) / cell), i1 = Math.floor((c.maxX - x0) / cell);
      const j0 = Math.floor((c.minZ - z0) / cell), j1 = Math.floor((c.maxZ - z0) / cell);
      for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) {
          const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell;
          if (!World.circleOBB(c, cx, cz, agentR, o)) continue;
          const arr = cand[j * this.w + i];
          let dup = false;
          for (const h of arr) if (Math.abs(h - c.top) < 0.06) { dup = true; break; }
          if (!dup) arr.push(c.top);
        }
      }
    }

    // 过滤：必须有真实支撑面、不能被墙体穿过、脚下不能是栏杆
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const ci = j * this.w + i, cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell;
      for (const h of cand[ci]) {
        const sup = world.support(cx, cz, agentR * 0.95, h + 0.05);
        if (!sup || Math.abs(sup.y - h) > 0.1) continue;
        if (Math.min(sup.collider.hx, sup.collider.hz) * 2 < 0.36) continue;
        if (!this.clear(cx, h, cz)) continue;
        const id = this.nodeH.length;
        this.nodeCell.push(ci); this.nodeX.push(cx); this.nodeZ.push(cz); this.nodeH.push(h);
        this.cellNodes[ci].push(id);
      }
    }

    const N = this.nodeH.length;
    // 预计算邻接边：先做水平可达性检查，避免路径穿墙
    this.edges = new Array(N);
    for (let k = 0; k < N; k++) this.edges[k] = [];
    const addEdge = (a, b, cost) => { this.edges[a].push({ to: b, cost }); };
    for (let k = 0; k < N; k++) {
      const ci = this.nodeCell[k], ki = ci % this.w, kj = (ci / this.w) | 0, hk = this.nodeH[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = ki + di, nj = kj + dj;
        if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
        for (const nk of this.cellNodes[nj * this.w + ni]) {
          if (nk === k) continue;
          const dh = this.nodeH[nk] - hk;
          if (dh > JUMP_UP || dh < -DROP_DOWN) continue;
          if (!this.edgeClear(k, nk)) continue;
          let cost;
          if (dh > STEP_UP) cost = 2.8 + dh * 2.2;
          else if (dh < -STEP_UP) cost = 1.0 - dh * 0.4;
          else cost = (di && dj) ? 1.4142 : 1;
          addEdge(k, nk, cost);
        }
      }
      // 跨格跳：格子边缘缺节点时，补齐 1m 左右的箱顶跳跃
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const cheb = Math.max(Math.abs(di), Math.abs(dj));
        if (cheb < 2) continue;
        const ni = ki + di, nj = kj + dj;
        if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
        for (const nk of this.cellNodes[nj * this.w + ni]) {
          const dh = this.nodeH[nk] - hk;
          if (dh > STEP_UP) {
            if (dh > JUMP_UP) continue;
            if (!this.edgeClear(k, nk)) continue;
            addEdge(k, nk, 3.2 + cheb * 0.8 + dh * 2.5);
          } else if (Math.abs(dh) <= STEP_UP) {
            // 跨格平地：要求中点有连续支撑面，避免从空中跨过缺口
            const mx = (this.nodeX[k] + this.nodeX[nk]) / 2, mz = (this.nodeZ[k] + this.nodeZ[nk]) / 2;
            const top = Math.max(this.nodeH[k], this.nodeH[nk]);
            const sup = this.world.support(mx, mz, this.agentR * 0.8, top + 0.45);
            if (!sup || Math.abs(sup.y - top) > 0.55) continue;
            if (!this.edgeClear(k, nk)) continue;
            addEdge(k, nk, cheb * 0.7 + Math.abs(dh) * 1.5);
          }
        }
      }
    }
    this.g = new Float32Array(N);
    this.f = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.gen = 1;
  }

  // 站在 (cx,h,cz) 时身体是否被挡住；允许 0.45m 以内的台阶
  clear(cx, h, cz) {
    const r = this.agentR * 0.85, o = {};
    const cands = this.world.query(cx - r, cz - r, cx + r, cz + r);
    for (const c of cands) {
      if (!c.solid) continue;
      if (c.top <= h + STEP_UP) continue;
      if (c.bottom >= h + 1.55) continue;
      if (World.circleOBB(c, cx, cz, r, o)) return false;
    }
    return true;
  }

  idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  nearestNode(x, z, y) {
    const ci = this.idx(x, z);
    if (ci < 0) return -1;
    const i0 = ci % this.w, j0 = (ci / this.w) | 0;
    let best = -1, bestScore = Infinity;
    for (let r = 0; r <= 8; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        for (const id of this.cellNodes[j * this.w + i]) {
          const d = Math.hypot(this.nodeX[id] - x, this.nodeZ[id] - z);
          const s = d + Math.abs(this.nodeH[id] - y) * 3;
          if (s < bestScore) { bestScore = s; best = id; }
        }
      }
      if (best >= 0 && bestScore < this.cell * 1.5) break;
    }
    return best;
  }

  // 水平边是否可走：中点处身体不能被墙挡住
  edgeClear(a, b) {
    const dx = this.nodeX[b] - this.nodeX[a], dz = this.nodeZ[b] - this.nodeZ[a];
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return true;
    const jump = this.nodeH[b] - this.nodeH[a] > STEP_UP;
    const y = Math.max(this.nodeH[a], this.nodeH[b]) + (jump ? 0.12 : 0.02);
    const n = Math.max(2, Math.ceil(d / 0.45));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!this.clear(this.nodeX[a] + dx * t, y, this.nodeZ[a] + dz * t)) return false;
    }
    return true;
  }

  // 返回 [x,z,高度,是否需要跳上这个点]
  findPath(ax, az, bx, bz, startY = 0, goalY = null) {
    const s = this.nearestNode(ax, az, startY);
    const targetY = goalY === null ? startY : goalY;
    const e = this.nearestNode(bx, bz, targetY);
    if (s < 0 || e < 0) return null;
    if (Math.abs(this.nodeH[e] - targetY) > 0.45) return null;
    const W = this.w;
    const gen = ++this.gen;
    const g = this.g, f = this.f;
    const heap = [];
    const push = (k) => {
      heap.push(k); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const ei = e % W, ej = (e / W) | 0, eh = this.nodeH[e];
    const hfn = (k) => {
      const ci = this.nodeCell[k], i = ci % W, j = (ci / W) | 0;
      const dx = Math.abs(i - ei), dz = Math.abs(j - ej);
      return dx + dz + (1.4142 - 2) * Math.min(dx, dz) + Math.abs(this.nodeH[k] - eh) * 0.8;
    };
    g[s] = 0; f[s] = hfn(s); this.seen[s] = gen; this.parent[s] = -1; push(s);
    let found = false, iter = 0;
    while (heap.length && iter++ < 40000) {
      const k = pop();
      if (this.closed[k] === gen) continue;
      this.closed[k] = gen;
      if (k === e) { found = true; break; }
      const edges = this.edges[k];
      for (let j = 0; j < edges.length; j++) {
        const ed = edges[j], nk = ed.to;
        if (this.closed[nk] === gen) continue;
        const ng = g[k] + ed.cost;
        if (this.seen[nk] !== gen || ng < g[nk]) {
          this.seen[nk] = gen; g[nk] = ng; f[nk] = ng + hfn(nk); this.parent[nk] = k; push(nk);
        }
      }
    }
    if (!found) return null;
    const ids = [];
    for (let k = e; k !== -1; k = this.parent[k]) ids.push(k);
    ids.reverse();
    const out = [];
    for (let n = 0; n < ids.length; n++) {
      const id = ids[n], prev = n > 0 ? ids[n - 1] : -1;
      const jump = prev >= 0 && this.nodeH[id] - this.nodeH[prev] > STEP_UP;
      out.push([this.nodeX[id], this.nodeZ[id], this.nodeH[id], jump]);
    }
    out[0][0] = ax; out[0][1] = az;
    const last = out[out.length - 1];
    last[0] = bx; last[1] = bz; last[2] = targetY;
    return out;
  }

  randomFree(rnd, x0, z0, x1, z1, y = 0) {
    for (let t = 0; t < 100; t++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      const ci = this.idx(x, z);
      if (ci < 0) continue;
      for (const id of this.cellNodes[ci]) {
        if (Math.abs(this.nodeH[id] - y) < 0.3) return [this.nodeX[id], this.nodeZ[id], this.nodeH[id]];
      }
    }
    return null;
  }
}
