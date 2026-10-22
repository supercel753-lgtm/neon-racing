'use strict';
(function () {
  /* =====================================================================
     NEON PURSUIT — jogo de corrida 3D em mundo aberto (Three.js r128)
     Mundo procedural infinito em grade, trânsito, polícia, garagem e história.
     ===================================================================== */
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  function hash2(i, j, s) {
    let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- constantes e save ---------------- */
  const P = 120, RW = 24, HALF = 12;           // período da grade, largura da rua
  let save = { cash: 3000, owned: [0], cur: 0, ch: 0, colors: {} };
  try { Object.assign(save, JSON.parse(localStorage.getItem('np_save') || '{}')); } catch (e) {}
  const persist = () => { try { localStorage.setItem('np_save', JSON.stringify(save)); } catch (e) {} };

  const CARS = [
    { name: 'Vira-Lata 1.0', price: 0,     top: 44, acc: 14, turn: 2.3,  grip: 6.5, len: 3.9, wid: 1.8,  color: 0xe8b13a },
    { name: 'Falcão S',      price: 9000,  top: 52, acc: 17, turn: 2.4,  grip: 7.0, len: 4.4, wid: 1.85, color: 0x3a7be8 },
    { name: 'Tigre RS',      price: 22000, top: 59, acc: 20, turn: 2.5,  grip: 7.5, len: 4.3, wid: 1.9,  color: 0xd23a3a },
    { name: 'Relâmpago GT',  price: 42000, top: 66, acc: 23, turn: 2.35, grip: 7.0, len: 4.7, wid: 1.95, color: 0x2fbf71, spoiler: 1 },
    { name: 'Fantasma X',    price: 80000, top: 74, acc: 27, turn: 2.6,  grip: 8.0, len: 4.5, wid: 2.0,  color: 0x9b59ff, spoiler: 1 }
  ];
  const SWATCH = [0xe8b13a, 0x3a7be8, 0xd23a3a, 0x2fbf71, 0x9b59ff, 0xf2f2f2, 0x222222, 0xff7a1a];

  const CHAPTERS = [
    { name: 'Cap. 1 — Primeira Largada', type: 'race', rivals: 1, steps: 14, reward: 4000, unlock: 1,
      intro: 'Prove que você pertence às ruas. Vença o Dante até a linha final.' },
    { name: 'Cap. 2 — Contra o Relógio', type: 'time', steps: 18, reward: 7000, unlock: 2,
      intro: 'Passe por todos os checkpoints antes do tempo acabar.' },
    { name: 'Cap. 3 — Rei do Asfalto', type: 'race', rivals: 2, steps: 20, reward: 11000, unlock: 3,
      intro: 'Dois pilotos da lista de elite querem sua vaga. Corra!' },
    { name: 'Cap. 4 — Fuga Noturna', type: 'escape', cops: 3, reward: 15000, unlock: 4,
      intro: 'A polícia está atrás de você. Despiste todas as viaturas!' },
    { name: 'Cap. 5 — A Grande Final', type: 'race', rivals: 3, steps: 26, reward: 30000, unlock: null,
      intro: 'Os três melhores da cidade. Quem cruzar primeiro leva tudo.' }
  ];

  /* ---------------- qualidade ---------------- */
  const isTouch = matchMedia('(pointer: coarse)').matches;
  let quality = isTouch ? 0 : 1;
  try { const q = localStorage.getItem('np_q'); if (q !== null) quality = clamp(+q | 0, 0, 2); } catch (e) {}
  const QN = ['Baixa', 'Média', 'Alta'];
  const QS = [
    { pr: 0.6, R: 2, fog: 250 },
    { pr: 0.85, R: 3, fog: 350 },
    { pr: Math.min(window.devicePixelRatio || 1, 1.5), R: 4, fog: 450 }
  ];

  /* ---------------- renderer / cena ---------------- */
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  const SKY = 0x232a52;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 90, 350);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 420);
  scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x3a3048, 1.0));
  const sun = new THREE.DirectionalLight(0xffc29a, 0.75);
  sun.position.set(-0.6, 1, -0.4);
  scene.add(sun);

  let lastBlock = null;
  function resize() {
    renderer.setPixelRatio(QS[quality].pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  function applyQuality() {
    const q = QS[quality];
    scene.fog.near = q.fog * 0.3; scene.fog.far = q.fog;
    camera.far = q.fog + 70; camera.updateProjectionMatrix();
    resize();
    lastBlock = null;
    $('bQ').textContent = 'Qualidade: ' + QN[quality];
    try { localStorage.setItem('np_q', String(quality)); } catch (e) {}
  }
  window.addEventListener('resize', resize);

  /* ---------------- chão (textura de ruas em tile) ---------------- */
  function roadTexture() {
    const S = 512, k = S / P, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#2a2d34'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#5b5f69'; g.fillRect(HALF * k, HALF * k, (P - RW) * k, (P - RW) * k);
    g.strokeStyle = '#8a8f9a'; g.lineWidth = 0.8 * k;
    g.strokeRect(HALF * k + 0.4 * k, HALF * k + 0.4 * k, (P - RW - 0.8) * k, (P - RW - 0.8) * k);
    const s0 = HALF * k, len = (P - RW) * k;
    g.fillStyle = '#e8c547';
    g.fillRect(0.1 * k, s0, 0.2 * k, len); g.fillRect(S - 0.3 * k, s0, 0.2 * k, len);
    g.fillRect(s0, 0.1 * k, len, 0.2 * k); g.fillRect(s0, S - 0.3 * k, len, 0.2 * k);
    g.fillStyle = '#d8dbe2';
    const e1 = (HALF - 1) * k, w = 0.15 * k;
    g.fillRect(e1, s0, w, len); g.fillRect(S - e1 - w, s0, w, len);
    g.fillRect(s0, e1, len, w); g.fillRect(s0, S - e1 - w, len, w);
    for (let x = 0.8; x < HALF - 0.5; x += 1.6) {
      g.fillRect(x * k, (HALF + 1) * k, 0.8 * k, 3 * k);
      g.fillRect(S - (x + 0.8) * k, (HALF + 1) * k, 0.8 * k, 3 * k);
      g.fillRect(x * k, S - (HALF + 4) * k, 0.8 * k, 3 * k);
      g.fillRect(S - (x + 0.8) * k, S - (HALF + 4) * k, 0.8 * k, 3 * k);
      g.fillRect((HALF + 1) * k, x * k, 3 * k, 0.8 * k);
      g.fillRect((HALF + 1) * k, S - (x + 0.8) * k, 3 * k, 0.8 * k);
      g.fillRect(S - (HALF + 4) * k, x * k, 3 * k, 0.8 * k);
      g.fillRect(S - (HALF + 4) * k, S - (x + 0.8) * k, 3 * k, 0.8 * k);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  const TILES = 12;
  const groundTex = roadTexture();
  groundTex.repeat.set(TILES, TILES);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(TILES * P, TILES * P).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  scene.add(ground);

  /* ---------------- prédios (1 draw call, instanciados) ---------------- */
  const PAL = ['#7a7f93', '#8d7f8f', '#6f8294', '#9a8f7a', '#6b7390', '#85667a', '#707a7a'].map(c => new THREE.Color(c));
  const bcache = new Map();
  function blockB(i, j) {
    const key = i + ',' + j;
    let r = bcache.get(key);
    if (r) return r;
    r = [];
    const cx = i * P + P / 2, cz = j * P + P / 2;
    const dt = 1 + 2.2 * Math.exp(-Math.hypot(cx, cz) / 700);
    const lw = (P - RW) / 2;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      if (hash2(i * 2 + a, j * 2 + b, 7) < 0.07) continue;
      const w = Math.min(26 + hash2(i, j, a * 2 + b + 11) * 20, lw - 3);
      const d = Math.min(26 + hash2(j, i, a * 2 + b + 23) * 20, lw - 3);
      const h = (10 + Math.pow(hash2(i + a * 13, j + b * 17, 3), 2.2) * 55) * dt * 0.7 + 8;
      r.push({
        x: i * P + HALF + a * lw + lw / 2, z: j * P + HALF + b * lw + lw / 2, w, d, h,
        c: Math.floor(hash2(i, j, a * 5 + b) * PAL.length)
      });
    }
    if (bcache.size > 900) bcache.clear();
    bcache.set(key, r);
    return r;
  }

  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const unitG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  bmat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        vec3 nn = normal;
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4; nn = mat3(instanceMatrix) * nn;
        #endif
        wp4 = modelMatrix * wp4; vWP = wp4.xyz; vWN = normalize(nn);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <fog_fragment>', `
        if (abs(vWN.y) < 0.5) {
          float u = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
          float wc = abs(vWN.x) > 0.5 ? vWP.x : vWP.z;
          vec2 cell = vec2(u / 3.2, vWP.y / 3.6);
          vec2 f = fract(cell); vec2 id = floor(cell);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.8) * step(2.0, vWP.y);
          float r = fract(sin(dot(id + floor(wc * 0.37), vec2(12.9898, 78.233))) * 43758.5453);
          vec3 lit = r > 0.45 ? vec3(1.0, 0.82, 0.5) : vec3(0.08, 0.1, 0.17);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, lit, win * (r > 0.45 ? 0.9 : 0.7));
        }
        #include <fog_fragment>`);
  };
  const MAXB = 420, MAXL = 460;
  const bm = new THREE.InstancedMesh(unitG, bmat, MAXB);
  bm.frustumCulled = false; bm.count = 0; scene.add(bm);
  const poleM = new THREE.InstancedMesh(unitG, new THREE.MeshLambertMaterial({ color: 0x555a66 }), MAXL);
  const headM = new THREE.InstancedMesh(boxG, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), MAXL);
  poleM.frustumCulled = headM.frustumCulled = false; poleM.count = headM.count = 0;
  scene.add(poleM); scene.add(headM);
  const dummy = new THREE.Object3D();

  function rebuildWorld(bi, bj) {
    const R = QS[quality].R;
    let n = 0;
    for (let i = bi - R; i <= bi + R; i++) for (let j = bj - R; j <= bj + R; j++) {
      for (const b of blockB(i, j)) {
        if (n >= MAXB) break;
        dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d);
        dummy.updateMatrix(); bm.setMatrixAt(n, dummy.matrix); bm.setColorAt(n, PAL[b.c]); n++;
      }
    }
    bm.count = n; bm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    let m = 0;
    const o = HALF + 1;
    for (let i = bi - R; i <= bi + R + 1; i++) for (let j = bj - R; j <= bj + R + 1; j++) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (m >= MAXL) break;
        const x = i * P + sx * o, z = j * P + sz * o;
        dummy.position.set(x, 0, z); dummy.scale.set(0.3, 8, 0.3); dummy.updateMatrix(); poleM.setMatrixAt(m, dummy.matrix);
        dummy.position.set(x - sx * 0.6, 8.1, z - sz * 0.6); dummy.scale.set(1.5, 0.25, 0.6); dummy.updateMatrix(); headM.setMatrixAt(m, dummy.matrix);
        m++;
      }
    }
    poleM.count = headM.count = m;
    poleM.instanceMatrix.needsUpdate = headM.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- carros (modelo procedural) ---------------- */
  const wheelG = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10).rotateZ(Math.PI / 2);
  const coneG = new THREE.ConeGeometry(0.4, 2, 8);
  const matWheel = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const matGlass = new THREE.MeshLambertMaterial({ color: 0x1b2430 });
  const matTail = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const matHead = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const matFlame = new THREE.MeshBasicMaterial({ color: 0x7ad0ff, transparent: true, opacity: 0.85 });
  const matRed = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const matBlue = new THREE.MeshBasicMaterial({ color: 0x2060ff });

  function buildCar(def, color, cop) {
    const g = new THREE.Group(), L = def.len, W = def.wid;
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const add = (geo, mat, x, y, z, sx, sy, sz) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m;
    };
    add(boxG, bodyMat, 0, 0.55, 0, W, 0.55, L);
    add(boxG, matGlass, 0, 1.08, -L * 0.06, W * 0.84, 0.5, L * 0.5);
    add(boxG, bodyMat, 0, 1.35, -L * 0.06, W * 0.7, 0.06, L * 0.42);
    add(boxG, matTail, 0, 0.7, -L / 2 - 0.01, W * 0.86, 0.14, 0.06);
    add(boxG, matHead, 0, 0.66, L / 2 + 0.01, W * 0.86, 0.14, 0.06);
    if (def.spoiler) {
      add(boxG, bodyMat, 0, 1.25, -L / 2 + 0.2, W * 0.9, 0.06, 0.5);
      add(boxG, matGlass, W * 0.32, 1.0, -L / 2 + 0.2, 0.06, 0.5, 0.3);
      add(boxG, matGlass, -W * 0.32, 1.0, -L / 2 + 0.2, 0.06, 0.5, 0.3);
    }
    const wheels = [], pivots = [];
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const p = new THREE.Group();
      p.position.set(sx * (W / 2 - 0.08), 0.38, sz * L * 0.32);
      const w = new THREE.Mesh(wheelG, matWheel);
      p.add(w); g.add(p); wheels.push(w); if (sz > 0) pivots.push(p);
    }
    const flame = new THREE.Mesh(coneG, matFlame);
    flame.position.set(0, 0.6, -L / 2 - 1); flame.rotation.x = -Math.PI / 2; flame.visible = false; g.add(flame);
    let bar = null;
    if (cop) {
      bar = [add(boxG, matRed, 0.35, 1.45, -L * 0.06, 0.5, 0.14, 0.3), add(boxG, matBlue, -0.35, 1.45, -L * 0.06, 0.5, 0.14, 0.3)];
    }
    g.userData = { bodyMat, wheels, pivots, flame, bar };
    return g;
  }
  function killMesh(m) {
    if (!m) return;
    scene.remove(m);
    if (m.userData && m.userData.bodyMat) m.userData.bodyMat.dispose();
  }

  /* ---------------- estado dos carros ---------------- */
  function newCar(def) {
    return { def, x: 0, z: 0, h: 0, vx: 0, vz: 0, steer: 0, speed: 0, vf: 0, vl: 0, boost: false, nitro: 1, mesh: null };
  }
  const player = newCar(CARS[0]);
  function carColor(idx) { return save.colors[idx] != null ? save.colors[idx] : CARS[idx].color; }
  function setPlayerCar(idx, colorOverride) {
    killMesh(player.mesh);
    player.def = CARS[idx];
    player.mesh = buildCar(CARS[idx], colorOverride != null ? colorOverride : carColor(idx), false);
    scene.add(player.mesh);
  }
  function placeCar(c, x, z, h) {
    c.x = x; c.z = z; c.h = h; c.vx = c.vz = 0; c.steer = 0; c.speed = c.vf = c.vl = 0; c.boost = false;
  }

  /* ---------------- física arcade ---------------- */
  function carStep(c, inp, dt) {
    const d = c.def, top = d.top * (c.boost ? 1.28 : 1);
    let fx = Math.sin(c.h), fz = Math.cos(c.h);
    let vf = c.vx * fx + c.vz * fz;
    c.steer += (inp.steer - c.steer) * Math.min(1, dt * 9);
    const sp = Math.abs(vf);
    let yaw = -c.steer * d.turn * clamp(vf / 5, -1, 1) / (1 + sp / 38);
    if (inp.hb) yaw *= 1.45;
    c.h += yaw * dt;
    fx = Math.sin(c.h); fz = Math.cos(c.h);
    const lx = fz, lz = -fx;
    vf = c.vx * fx + c.vz * fz;
    let a = 0;
    if (inp.thr > 0) {
      const r = clamp(vf / top, 0, 1.2);
      a = inp.thr * d.acc * (1 - r * r * 0.95) * (vf < 0 ? 2 : 1);
    } else if (inp.thr < 0) {
      a = vf > 1 ? inp.thr * 30 : inp.thr * 9 * (1 - clamp(-vf / 14, 0, 1));
    }
    if (c.boost && vf > 0) a += 18;
    if (inp.hb && Math.abs(vf) > 1) a -= Math.sign(vf) * 8;
    a -= vf * 0.04 + (Math.abs(vf) > 0.5 ? Math.sign(vf) * 0.6 : 0);
    c.vx += fx * a * dt; c.vz += fz * a * dt;
    const vl = c.vx * lx + c.vz * lz;
    const k = 1 - Math.exp(-d.grip * (inp.hb ? 0.22 : 1) * dt);
    c.vx -= lx * vl * k; c.vz -= lz * vl * k;
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.speed = Math.hypot(c.vx, c.vz);
    c.vf = c.vx * fx + c.vz * fz; c.vl = vl;
  }

  function collideBuildings(c) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h), r = c.def.wid * 0.5 + 0.15;
    let hit = 0;
    for (const o of [1.2, -1.2]) {
      let px = c.x + fx * o, pz = c.z + fz * o;
      const list = blockB(Math.floor(px / P), Math.floor(pz / P));
      for (let q = 0; q < list.length; q++) {
        const b = list[q], hx = b.w / 2, hz = b.d / 2;
        const cx = clamp(px, b.x - hx, b.x + hx), cz = clamp(pz, b.z - hz, b.z + hz);
        const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, pen;
        if (d2 < 1e-6) { nx = px < b.x ? -1 : 1; nz = 0; pen = r + hx - Math.abs(px - b.x); }
        else { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
        c.x += nx * pen; c.z += nz * pen; px += nx * pen; pz += nz * pen;
        const vn = c.vx * nx + c.vz * nz;
        if (vn < 0) {
          c.vx -= 1.25 * vn * nx; c.vz -= 1.25 * vn * nz;
          c.vx *= 0.96; c.vz *= 0.96;
          if (-vn > hit) hit = -vn;
        }
      }
    }
    return hit;
  }

  /* ---------------- trânsito (instanciado) ---------------- */
  const TMAX = 36;
  const tMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const tBody = new THREE.InstancedMesh(boxG, tMat, TMAX);
  const tCab = new THREE.InstancedMesh(boxG, matGlass, TMAX);
  const tTail = new THREE.InstancedMesh(boxG, matTail, TMAX);
  const tHead = new THREE.InstancedMesh(boxG, matHead, TMAX);
  [tBody, tCab, tTail, tHead].forEach(m => { m.frustumCulled = false; scene.add(m); });
  const TCOL = ['#c9ced8', '#2c3e72', '#a53a3a', '#d9b64a', '#3b8f6a', '#e8e8e8', '#1a1a1e', '#7b4fa3'].map(c => new THREE.Color(c));
  const traffic = [];
  for (let i = 0; i < TMAX; i++) {
    traffic.push({ axis: 0, dir: 1, road: 0, lane: 4.5, s: 0, spd: 10, slow: 0, x: 0, z: 0, h: 0, vx: 0, vz: 0 });
    tBody.setColorAt(i, TCOL[i % TCOL.length]);
  }
  function placeTraffic(t) {
    t.x = t.axis === 0 ? t.s : t.road * P - t.dir * 4.5;
    t.z = t.axis === 0 ? t.road * P + t.dir * 4.5 : t.s;
    t.h = t.axis === 0 ? t.dir * Math.PI / 2 : (t.dir > 0 ? 0 : Math.PI);
  }
  function spawnTraffic(t, initial) {
    t.axis = Math.random() < 0.5 ? 0 : 1;
    t.dir = Math.random() < 0.5 ? 1 : -1;
    const perp = t.axis === 0 ? player.z : player.x, along = t.axis === 0 ? player.x : player.z;
    t.road = Math.round(perp / P) + Math.floor(Math.random() * 7) - 3;
    t.s = along + (initial ? (Math.random() - 0.5) * 620 : (Math.random() < 0.5 ? -1 : 1) * (270 + Math.random() * 60));
    if (initial && Math.abs(t.s - along) < 40) t.s += 80;
    t.spd = 9 + Math.random() * 8; t.slow = 0;
    placeTraffic(t);
  }
  function updateTraffic(dt) {
    for (const t of traffic) {
      t.s += t.dir * t.spd * (t.slow > 0 ? 0.3 : 1) * dt;
      t.slow -= dt;
      placeTraffic(t);
      const sp = t.spd * (t.slow > 0 ? 0.3 : 1) * t.dir;
      t.vx = t.axis === 0 ? sp : 0; t.vz = t.axis === 0 ? 0 : sp;
      if (Math.abs(t.x - player.x) > 360 || Math.abs(t.z - player.z) > 360) spawnTraffic(t, false);
    }
  }
  function part(mesh, i, x, z, h, ox, oy, oz, sx, sy, sz) {
    const c = Math.cos(h), s = Math.sin(h);
    dummy.position.set(x + ox * c + oz * s, oy, z - ox * s + oz * c);
    dummy.rotation.set(0, h, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  function syncTraffic() {
    for (let i = 0; i < TMAX; i++) {
      const t = traffic[i];
      part(tBody, i, t.x, t.z, t.h, 0, 0.55, 0, 1.8, 0.55, 4.0);
      part(tCab, i, t.x, t.z, t.h, 0, 1.08, -0.25, 1.5, 0.5, 2.0);
      part(tTail, i, t.x, t.z, t.h, 0, 0.7, -2.01, 1.5, 0.14, 0.06);
      part(tHead, i, t.x, t.z, t.h, 0, 0.66, 2.01, 1.5, 0.14, 0.06);
    }
    [tBody, tCab, tTail, tHead].forEach(m => { m.instanceMatrix.needsUpdate = true; });
    if (tBody.instanceColor) tBody.instanceColor.needsUpdate = true;
  }

  /* ---------------- áudio ---------------- */
  let AC = null, eng = null, filt = null, engG = null, noiseBuf = null, muted = false;
  function initAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      eng = AC.createOscillator(); eng.type = 'sawtooth';
      filt = AC.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500;
      engG = AC.createGain(); engG.gain.value = 0;
      eng.connect(filt); filt.connect(engG); engG.connect(AC.destination); eng.start();
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    } catch (e) { AC = null; }
  }
  function sfxCrash(v) {
    if (!AC || muted) return;
    const s = AC.createBufferSource(), g = AC.createGain();
    s.buffer = noiseBuf; g.gain.value = clamp(v / 25, 0.05, 0.5);
    s.connect(g); g.connect(AC.destination); s.start();
  }
  function updateAudio(thr) {
    if (!AC) return;
    const t = AC.currentTime, sp = player.speed;
    eng.frequency.setTargetAtTime(48 + sp * 2.4 + (thr > 0 ? 18 : 0) + (player.boost ? 25 : 0), t, 0.06);
    filt.frequency.setTargetAtTime(380 + sp * 16 + (thr > 0 ? 250 : 0), t, 0.08);
    engG.gain.setTargetAtTime(muted || state !== 'playing' ? 0 : 0.05, t, 0.1);
  }

  /* ---------------- entrada ---------------- */
  const keys = {};
  const touch = { left: false, right: false, gas: false, brake: false, nos: false, hb: false };
  window.addEventListener('keydown', e => {
    initAudio();
    if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
    keys[e.code] = true;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'KeyM') muted = !muted;
    else if (e.code === 'KeyQ') { quality = (quality + 1) % 3; applyQuality(); showMsg('Qualidade: ' + QN[quality], 1200); }
    else if (e.code === 'KeyR' && state === 'playing') respawnPlayer();
    else if (e.code === 'KeyC' && state === 'playing' && !mission) cycleCar();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'playing') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') togglePause(); });
  document.querySelectorAll('#touch .tb').forEach(el => {
    const k = el.dataset.k;
    const on = e => { e.preventDefault(); initAudio(); touch[k] = true; el.classList.add('on'); };
    const off = e => { e.preventDefault(); touch[k] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', e => e.preventDefault());
  });
  function readInput() {
    let thr = 0, steer = 0, hb = false, nos = false;
    if (keys.KeyW || keys.ArrowUp || touch.gas) thr += 1;
    if (keys.KeyS || keys.ArrowDown || touch.brake) thr -= 1;
    if (keys.KeyA || keys.ArrowLeft || touch.left) steer -= 1;
    if (keys.KeyD || keys.ArrowRight || touch.right) steer += 1;
    hb = !!(keys.Space || touch.hb); nos = !!(keys.ShiftLeft || keys.ShiftRight || touch.nos);
    const gps = navigator.getGamepads ? navigator.getGamepads() : null;
    const gp = gps && gps[0];
    if (gp) {
      if (Math.abs(gp.axes[0]) > 0.15) steer += gp.axes[0];
      thr += (gp.buttons[7] ? gp.buttons[7].value : 0) - (gp.buttons[6] ? gp.buttons[6].value : 0);
      hb = hb || !!(gp.buttons[0] && gp.buttons[0].pressed);
      nos = nos || !!(gp.buttons[1] && gp.buttons[1].pressed);
    }
    return { thr: clamp(thr, -1, 1), steer: clamp(steer, -1, 1), hb, nos };
  }

  /* ---------------- colisões carro × carro ---------------- */
  function pairCollide(a, b, wasPlayer) {
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.abs(dx) > 4 || Math.abs(dz) > 4) return 0;
    const d = Math.hypot(dx, dz), rm = 3.3;
    if (d >= rm || d < 0.01) return 0;
    const nx = dx / d, nz = dz / d, pen = rm - d;
    a.x -= nx * pen * 0.5; a.z -= nz * pen * 0.5; b.x += nx * pen * 0.5; b.z += nz * pen * 0.5;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const j = -1.4 * rv * 0.5;
      a.vx -= j * nx; a.vz -= j * nz; b.vx += j * nx; b.vz += j * nz;
      return -rv;
    }
    return 0;
  }
  function trafficCollide(c) {
    let hit = 0;
    for (const t of traffic) {
      const dx = c.x - t.x, dz = c.z - t.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const d = Math.hypot(dx, dz), rm = 3.3;
      if (d >= rm || d < 0.01) continue;
      const nx = dx / d, nz = dz / d;
      c.x += nx * (rm - d); c.z += nz * (rm - d);
      const rv = (c.vx - t.vx) * nx + (c.vz - t.vz) * nz;
      if (rv < 0) {
        c.vx -= 1.2 * rv * nx * 0.85; c.vz -= 1.2 * rv * nz * 0.85;
        c.vx *= 0.95; c.vz *= 0.95;
        t.slow = 1.6;
        if (-rv > hit) hit = -rv;
      }
    }
    return hit;
  }

  /* ---------------- IA genérica ---------------- */
  function driveToward(c, tx, tz, targetSpeed) {
    const want = Math.atan2(tx - c.x, tz - c.z);
    const diff = wrapA(want - c.h);
    const ts = targetSpeed * (1 - clamp(Math.abs(diff) * 0.7, 0, 0.65));
    const vf = c.vf || 0;
    return { thr: vf < ts ? 1 : (vf > ts + 5 ? -0.5 : 0), steer: clamp(-diff * 2.2, -1, 1), hb: false };
  }
  function brakeSpeed(cs, dist, top) {
    return Math.min(top, Math.sqrt(cs * cs + 2 * 20 * Math.max(0, dist - 12)));
  }

  /* ---------------- missões ---------------- */
  let state = 'menu', mission = null, prevState = 'menu';
  const rivals = [], cops = [];
  const pursuit = { on: false, level: 1, t: 0, far: 0, bust: 0, spawnT: 0 };
  let patrolT = 20, cashF = 0;

  function genRoute(idx, steps) {
    const rng = mulberry(1000 + idx * 77);
    let i = Math.floor((rng() - 0.5) * 20), j = Math.floor((rng() - 0.5) * 20);
    const nodes = [{ i, j }];
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let d = Math.floor(rng() * 4);
    for (let s = 0; s < steps; s++) {
      const r = rng();
      if (r < 0.22) d = (d + 1) % 4; else if (r < 0.44) d = (d + 3) % 4;
      i += D[d][0]; j += D[d][1]; nodes.push({ i, j });
    }
    return nodes;
  }
  function clearAI() {
    for (const r of rivals) killMesh(r.mesh);
    for (const c of cops) killMesh(c.mesh);
    rivals.length = 0; cops.length = 0;
    pursuit.on = false; pursuit.bust = 0; pursuit.t = 0; pursuit.far = 0;
    patrolT = 20;
  }
  function resetTraffic() { for (const t of traffic) spawnTraffic(t, true); }

  function startFree() {
    clearAI(); mission = null;
    setPlayerCar(save.cur);
    placeCar(player, 0, 0, 0); player.nitro = 1;
    resetTraffic();
    setState('playing');
    showMsg('Mundo aberto — cuidado com a polícia!', 2500);
  }
  function startMission(idx) {
    clearAI();
    const ch = CHAPTERS[idx];
    setPlayerCar(save.cur);
    const nodes = genRoute(idx, ch.steps || 8);
    const n0 = nodes[0], n1 = nodes[1];
    const fdx = n1.i - n0.i, fdz = n1.j - n0.j, h = Math.atan2(fdx, fdz);
    const fx = Math.sin(h), fz = Math.cos(h), lx = fz, lz = -fx;
    mission = { idx, ch, type: ch.type, nodes, cp: 1, cd: 3.6, t: 0, limit: 0, done: false };
    placeCar(player, n0.i * P - fx * 8, n0.j * P - fz * 8, h); player.nitro = 1;
    if (ch.type === 'time') {
      mission.limit = (ch.steps * P) / (player.def.top * 0.6) + 8;
    }
    if (ch.type === 'race') {
      for (let r = 0; r < ch.rivals; r++) {
        const base = CARS[(idx + r + 1) % CARS.length];
        const skill = 0.9 + 0.03 * idx + r * 0.015;
        const def = Object.assign({}, base, {
          top: player.def.top * skill, acc: Math.max(base.acc * 0.8, player.def.acc * skill), turn: base.turn, grip: base.grip
        });
        const c = newCar(def);
        const lat = (r % 2 === 0 ? -1 : 1) * 4, back = 8 + 7 * Math.floor(r / 2) + 6;
        placeCar(c, n0.i * P - fx * back + lx * lat, n0.j * P - fz * back + lz * lat, h);
        c.mesh = buildCar(def, SWATCH[(r * 3 + idx + 2) % SWATCH.length], false);
        scene.add(c.mesh);
        c.ai = { k: 1, skill, stuck: 0, finished: false };
        rivals.push(c);
      }
    }
    if (ch.type === 'escape') {
      placeCar(player, n0.i * P, n0.j * P, h);
      mission.cd = 2.2;
    }
    resetTraffic();
    for (const t of traffic) { if (Math.hypot(t.x - player.x, t.z - player.z) < 60) spawnTraffic(t, false); }
    setState('playing');
    showMsg(ch.intro, 3500);
    camH = h;
  }

  function nodeDist(c, n) { return Math.hypot(n.i * P - c.x, n.j * P - c.z); }
  function routeS(c, k, nodes) { return k * P - nodeDist(c, nodes[Math.min(k, nodes.length - 1)]); }

  function updateRival(r, dt, frozen) {
    const m = mission, nodes = m.nodes, ai = r.ai;
    if (frozen) { r.vx = r.vz = 0; return; }
    if (ai.finished) { carStep(r, { thr: -0.5, steer: 0, hb: false }, dt); return; }
    const n = nodes[ai.k];
    if (nodeDist(r, n) < 16) {
      ai.k++;
      if (ai.k >= nodes.length) { ai.finished = true; return; }
    }
    const cur = nodes[ai.k], nxt = nodes[ai.k + 1], prv = nodes[ai.k - 1];
    const turn = nxt && prv && ((cur.i - prv.i) !== (nxt.i - cur.i) || (cur.j - prv.j) !== (nxt.j - cur.j));
    const gap = routeS(player, m.cp, nodes) - routeS(r, ai.k, nodes);
    const pace = clamp(1 + gap * 0.0006, 0.86, 1.06) * (r.def.top);
    const dist = nodeDist(r, cur);
    const ts = turn ? brakeSpeed(18 + ai.skill * 4, dist, pace) : pace;
    const inp = driveToward(r, cur.i * P, cur.j * P, ts);
    r.boost = false;
    carStep(r, inp, dt);
    collideBuildings(r);
    if (r.speed < 2.5) ai.stuck += dt; else ai.stuck = 0;
    if (ai.stuck > 2) {
      const a = nodes[Math.max(0, ai.k - 1)], b = nodes[ai.k];
      placeCar(r, a.i * P, a.j * P, Math.atan2(b.i - a.i, b.j - a.j)); ai.stuck = 0;
    }
  }

  function finishMission(win, reason) {
    const m = mission;
    if (!m || m.done) return;
    m.done = true;
    const btns = [];
    let title, text;
    if (win) {
      const first = m.idx >= save.ch;
      const rw = first ? m.ch.reward : Math.round(m.ch.reward * 0.25);
      save.cash += rw;
      text = 'Recompensa: $' + rw.toLocaleString('pt-BR') + (first ? '' : ' (repetição: 25%)');
      if (first) {
        save.ch = Math.max(save.ch, m.idx + 1);
        const u = m.ch.unlock;
        if (u != null && !save.owned.includes(u)) { save.owned.push(u); text += '\nNovo carro na garagem: ' + CARS[u].name + '!'; }
      }
      persist();
      title = 'VITÓRIA!';
      if (m.idx + 1 < CHAPTERS.length) btns.push(['Próximo capítulo', () => startMission(m.idx + 1)]);
      else btns.push(['Final do jogo — mundo aberto', startFree]);
    } else {
      title = 'DERROTA';
      text = reason || 'Tente de novo!';
    }
    btns.push(['Tentar de novo', () => startMission(m.idx)]);
    btns.push(['Menu principal', toMenu]);
    showResult(title, text, btns);
  }

  /* ---------------- polícia ---------------- */
  function makeCop(i, j, chase) {
    const mul = mission && mission.type === 'escape' ? 0.93 : 0.98;
    const def = Object.assign({}, CARS[2], { top: Math.max(40, player.def.top * mul), acc: Math.max(18, player.def.acc), len: 4.5, wid: 1.9, grip: 7, turn: 2.4 });
    const c = newCar(def);
    placeCar(c, i * P, j * P, 0);
    c.mesh = buildCar(def, 0xf2f2f2, true); scene.add(c.mesh);
    c.mode = chase ? 'chase' : 'patrol';
    c.prev = null; c.cur = null; c.next = null; c.stuck = 0;
    cops.push(c);
    return c;
  }
  function spawnCopAround(chase, minD, maxD) {
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const i = Math.round((player.x + Math.sin(a) * d) / P), j = Math.round((player.z + Math.cos(a) * d) / P);
      const dd = Math.hypot(i * P - player.x, j * P - player.z);
      if (dd >= minD * 0.8 && dd <= maxD * 1.2) {
        const c = makeCop(i, j, chase);
        c.h = Math.atan2(player.x - c.x, player.z - c.z);
        return c;
      }
    }
    return null;
  }
  function chooseNext(from, prev) {
    let best = null, bs = 1e9;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = from.i + di, nj = from.j + dj;
      if (prev && ni === prev.i && nj === prev.j) continue;
      const d = Math.hypot(ni * P - player.x, nj * P - player.z) + Math.random() * 10;
      if (d < bs) { bs = d; best = { i: ni, j: nj }; }
    }
    return best || prev;
  }
  function updateCop(c, dt) {
    if (c.mode === 'patrol') {
      carStep(c, { thr: -0.2, steer: 0, hb: false }, dt);
      const d = Math.hypot(player.x - c.x, player.z - c.z);
      if (d < 55 && player.speed > 32) { c.mode = 'chase'; startPursuit(); }
      return;
    }
    const dxp = player.x - c.x, dzp = player.z - c.z, dp = Math.hypot(dxp, dzp);
    let tx, tz, cs = Infinity, dist = 0;
    const aligned = (Math.abs(dxp) < 9 || Math.abs(dzp) < 9) && dp < 90;
    if (aligned) { tx = player.x; tz = player.z; }
    else {
      if (!c.cur) {
        const fi = Math.round(c.x / P), fj = Math.round(c.z / P);
        c.cur = chooseNext({ i: fi, j: fj }, null); c.next = chooseNext(c.cur, { i: fi, j: fj }); c.prev = { i: fi, j: fj };
      }
      if (Math.hypot(c.cur.i * P - c.x, c.cur.j * P - c.z) < 18) {
        c.prev = c.cur; c.cur = c.next || chooseNext(c.cur, c.prev); c.next = chooseNext(c.cur, c.prev);
      }
      tx = c.cur.i * P; tz = c.cur.j * P;
      dist = Math.hypot(tx - c.x, tz - c.z);
      const turn = c.prev && c.next && ((c.cur.i - c.prev.i) !== (c.next.i - c.cur.i) || (c.cur.j - c.prev.j) !== (c.next.j - c.cur.j));
      if (turn) cs = 18;
    }
    const pace = c.def.top * (dp > 200 ? 1.12 : 1);
    const ts = cs < Infinity ? brakeSpeed(cs, dist, pace) : pace;
    c.boost = false;
    carStep(c, driveToward(c, tx, tz, ts), dt);
    collideBuildings(c);
    if (c.speed < 2.5) c.stuck += dt; else c.stuck = 0;
    if (c.stuck > 2.5 && c.cur) { placeCar(c, c.cur.i * P, c.cur.j * P, c.h); c.stuck = 0; }
  }
  function startPursuit() {
    if (pursuit.on) return;
    pursuit.on = true; pursuit.level = 1; pursuit.t = 0; pursuit.far = 0; pursuit.bust = 0; pursuit.spawnT = 2;
    for (const c of cops) c.mode = 'chase';
    showMsg('PERSEGUIÇÃO!', 2000);
  }
  function endPursuit(escaped) {
    const lvl = pursuit.level;
    for (const c of cops) killMesh(c.mesh);
    cops.length = 0;
    pursuit.on = false; pursuit.bust = 0; patrolT = 30;
    if (escaped) {
      if (mission && mission.type === 'escape') { finishMission(true); return; }
      const rw = 800 * lvl; save.cash += rw; persist();
      showMsg('VOCÊ ESCAPOU! +$' + rw, 3000);
    }
  }
  function busted() {
    if (mission && mission.type === 'escape') { endPursuit(false); finishMission(false, 'Você foi preso!'); return; }
    const fine = Math.min(Math.round(save.cash * 0.1), 2500);
    save.cash -= fine; persist();
    endPursuit(false);
    respawnPlayer();
    showMsg('PRESO! Multa: $' + fine, 3000);
  }
  function updatePursuit(dt) {
    if (pursuit.on) {
      pursuit.t += dt;
      pursuit.level = clamp(1 + Math.floor(pursuit.t / 25), 1, 4);
      const wanted = Math.min(5, 1 + pursuit.level);
      pursuit.spawnT -= dt;
      if (pursuit.far <= 0.01 && cops.length < wanted && pursuit.spawnT <= 0) { spawnCopAround(true, 140, 220); pursuit.spawnT = 4; }
      let minD = 1e9;
      for (let i = cops.length - 1; i >= 0; i--) {
        const c = cops[i], d = Math.hypot(c.x - player.x, c.z - player.z);
        if (d > 430) { killMesh(c.mesh); cops.splice(i, 1); continue; }
        if (d < minD) minD = d;
      }
      if (cops.length === 0 || minD > 200) pursuit.far += dt; else pursuit.far = Math.max(0, pursuit.far - dt * 2);
      if (pursuit.far > 6) { endPursuit(true); return; }
      if (minD < 9) pursuit.bust += dt * (0.3 + 0.5 * (1 - clamp(player.speed / 30, 0, 1)));
      else pursuit.bust = Math.max(0, pursuit.bust - dt * 0.4);
      if (pursuit.bust >= 1) busted();
    } else if (!mission) {
      if (!cops.length) { patrolT -= dt; if (patrolT <= 0) { spawnCopAround(false, 120, 220); patrolT = 25; } }
      for (let i = cops.length - 1; i >= 0; i--) {
        const c = cops[i];
        if (Math.hypot(c.x - player.x, c.z - player.z) > 380) { killMesh(c.mesh); cops.splice(i, 1); }
      }
    }
  }

  /* ---------------- respawn ---------------- */
  function respawnPlayer() {
    if (mission && mission.nodes && mission.type !== 'escape') {
      const a = mission.nodes[Math.max(0, mission.cp - 1)], b = mission.nodes[mission.cp];
      placeCar(player, a.i * P, a.j * P, Math.atan2(b.i - a.i, b.j - a.j));
      return;
    }
    const ri = Math.round(player.x / P) * P, rj = Math.round(player.z / P) * P;
    if (Math.abs(player.x - ri) < Math.abs(player.z - rj)) placeCar(player, ri, player.z, Math.cos(player.h) >= 0 ? 0 : Math.PI);
    else placeCar(player, player.x, rj, Math.sin(player.h) >= 0 ? Math.PI / 2 : -Math.PI / 2);
    camH = player.h;
  }

  /* ---------------- loop de simulação ---------------- */
  let shake = 0, camH = 0, orbit = 0, driftAcc = 0, lastThr = 0;
  function simulate(dt) {
    const inp = readInput();
    lastThr = inp.thr;
    const frozen = !!(mission && mission.cd > 0);
    if (mission && !mission.done && mission.cd > 0) {
      const before = Math.ceil(mission.cd);
      mission.cd -= dt;
      const now = Math.ceil(mission.cd);
      if (mission.cd <= 0) { showCount('GO!'); }
      else if (now !== before || before === Math.ceil(3.6)) showCount(String(now));
    }
    if (frozen) { player.vx = player.vz = 0; player.speed = 0; player.vf = 0; }
    else {
      const wantN = inp.nos && player.nitro > 0.02 && player.vf > 3;
      player.boost = wantN;
      if (wantN) player.nitro = Math.max(0, player.nitro - dt * 0.3);
      else player.nitro = Math.min(1, player.nitro + dt * 0.03);
      carStep(player, inp, dt);
      if (Math.abs(player.vl) > 3.5 && player.speed > 14 && !wantN) {
        player.nitro = Math.min(1, player.nitro + dt * 0.1);
        driftAcc += Math.abs(player.vl) * dt * 0.9;
        if (driftAcc >= 1) { const n = Math.floor(driftAcc); save.cash += n; cashF += n; driftAcc -= n; }
      }
    }
    let imp = collideBuildings(player);
    updateTraffic(dt);
    imp = Math.max(imp, trafficCollide(player));
    for (const r of rivals) { updateRival(r, dt, frozen); trafficCollide(r); }
    for (const c of cops) { updateCop(c, dt); trafficCollide(c); }
    // carro × carro (dinâmicos)
    const dyn = [player].concat(rivals, cops);
    for (let i = 0; i < dyn.length; i++) for (let j = i + 1; j < dyn.length; j++) {
      const v = pairCollide(dyn[i], dyn[j]);
      if (v > 0) {
        if (i === 0) { imp = Math.max(imp, v); if (cops.includes(dyn[j]) && dyn[j].mode === 'patrol') { dyn[j].mode = 'chase'; startPursuit(); } }
      }
    }
    if (imp > 3) { shake = Math.min(1, shake + imp * 0.03); sfxCrash(imp); }
    // missão
    if (mission && !mission.done && !frozen) {
      const m = mission;
      m.t += dt;
      if (m.type !== 'escape') {
        const n = m.nodes[m.cp];
        if (nodeDist(player, n) < 16) {
          m.cp++;
          if (m.cp >= m.nodes.length) { finishMission(true); }
          else showMsg('Checkpoint ' + (m.cp - 1) + '/' + (m.nodes.length - 1), 900);
        }
        if (!m.done && m.type === 'time') { m.limit -= dt; if (m.limit <= 0) finishMission(false, 'O tempo acabou!'); }
        if (!m.done && m.type === 'race') {
          for (const r of rivals) if (r.ai.finished) { finishMission(false, 'Um rival cruzou a linha primeiro.'); break; }
        }
      } else if (!pursuit.on && !m.started) {
        m.started = true;
        for (let k = 0; k < m.ch.cops; k++) spawnCopAround(true, 110, 170);
        startPursuit();
      }
    }
    if (!mission || mission.type === 'escape') updatePursuit(dt);
    shake = Math.max(0, shake - dt * 2.2);
  }

  /* ---------------- câmera ---------------- */
  function updateCamera(dt) {
    if (state === 'garage' || state === 'menu' || state === 'story') {
      orbit += dt * 0.35;
      const r = state === 'garage' ? 7.5 : 11;
      camera.position.set(player.x + Math.sin(orbit) * r, state === 'garage' ? 2.4 : 3.8, player.z + Math.cos(orbit) * r);
      camera.lookAt(player.x, 0.9, player.z);
      if (Math.abs(camera.fov - 50) > 0.1) { camera.fov = 50; camera.updateProjectionMatrix(); }
      return;
    }
    const spd = player.speed;
    let th = player.h;
    if (spd > 8 && player.vf > -1) th = player.h + wrapA(Math.atan2(player.vx, player.vz) - player.h) * 0.35 * Math.min(1, (spd - 8) / 20);
    camH += wrapA(th - camH) * Math.min(1, dt * 5);
    const dist = 7 + spd * 0.045 + (player.boost ? 1.5 : 0);
    const fx = Math.sin(camH), fz = Math.cos(camH);
    const sx = (Math.random() - 0.5) * shake * 0.8, sy = (Math.random() - 0.5) * shake * 0.5;
    camera.position.set(player.x - fx * dist + sx, 2.7 + spd * 0.012 + sy, player.z - fz * dist);
    camera.lookAt(player.x + fx * 8, 1.3, player.z + fz * 8);
    const tf = 62 + spd * 0.35 + (player.boost ? 10 : 0);
    if (Math.abs(camera.fov - tf) > 0.15) { camera.fov += (tf - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }

  /* ---------------- sincronização visual ---------------- */
  function syncCar(c, dt) {
    const m = c.mesh;
    if (!m) return;
    m.position.set(c.x, 0, c.z); m.rotation.y = c.h;
    const u = m.userData, spin = c.vf * dt / 0.38;
    for (let i = 0; i < u.wheels.length; i++) u.wheels[i].rotation.x += spin;
    for (let i = 0; i < u.pivots.length; i++) u.pivots[i].rotation.y = -c.steer * 0.4;
    u.flame.visible = !!c.boost;
    if (c.boost) u.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
  }
  const beam1 = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2de2c8, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  const beam2 = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4d8bff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  beam1.visible = beam2.visible = false; scene.add(beam1); scene.add(beam2);
  function updateMarkers(t) {
    const m = mission;
    if (!m || m.done || m.type === 'escape') { beam1.visible = beam2.visible = false; return; }
    const a = m.nodes[m.cp], b = m.nodes[m.cp + 1];
    beam1.visible = true; beam1.position.set(a.i * P, 30, a.j * P);
    const s = 1 + 0.08 * Math.sin(t * 6); beam1.scale.set(s, 1, s);
    if (b) { beam2.visible = true; beam2.position.set(b.i * P, 20, b.j * P); } else beam2.visible = false;
  }

  /* ---------------- HUD ---------------- */
  let msgTimer = 0, cntTimer = 0, hudT = 0, mapT = 0;
  function showMsg(t, ms) {
    $('msg').textContent = t; clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { $('msg').textContent = ''; }, ms || 2000);
  }
  function showCount(t) {
    $('count').textContent = t; clearTimeout(cntTimer);
    cntTimer = setTimeout(() => { $('count').textContent = ''; }, t === 'GO!' ? 900 : 1100);
  }
  const mmc = $('mm'), mg = mmc.getContext('2d'), MW = 170, MS = 0.32;
  function drawMap() {
    const ctr = MW / 2, cy = MW * 0.62, sh = Math.sin(player.h), ch = Math.cos(player.h);
    const toS = (x, z) => { const dx = x - player.x, dz = z - player.z; return [ctr - (dx * ch - dz * sh) * MS, cy - (dx * sh + dz * ch) * MS]; };
    mg.clearRect(0, 0, MW, MW);
    mg.save(); mg.beginPath(); mg.arc(ctr, ctr, ctr - 1, 0, 6.2832); mg.clip();
    mg.fillStyle = '#10131c'; mg.fillRect(0, 0, MW, MW);
    mg.strokeStyle = '#3b4258'; mg.lineWidth = RW * MS * 0.7;
    const rg = 320, i0 = Math.floor((player.x - rg) / P), i1 = Math.ceil((player.x + rg) / P);
    const j0 = Math.floor((player.z - rg) / P), j1 = Math.ceil((player.z + rg) / P);
    mg.beginPath();
    for (let i = i0; i <= i1; i++) { const a = toS(i * P, player.z - rg), b = toS(i * P, player.z + rg); mg.moveTo(a[0], a[1]); mg.lineTo(b[0], b[1]); }
    for (let j = j0; j <= j1; j++) { const a = toS(player.x - rg, j * P), b = toS(player.x + rg, j * P); mg.moveTo(a[0], a[1]); mg.lineTo(b[0], b[1]); }
    mg.stroke();
    if (mission && mission.nodes && mission.type !== 'escape' && !mission.done) {
      mg.strokeStyle = '#2de2c8'; mg.lineWidth = 3; mg.beginPath();
      const a0 = Math.max(0, mission.cp - 1), a1 = Math.min(mission.nodes.length - 1, mission.cp + 12);
      for (let k = a0; k <= a1; k++) { const n = mission.nodes[k], s = toS(n.i * P, n.j * P); if (k === a0) mg.moveTo(s[0], s[1]); else mg.lineTo(s[0], s[1]); }
      mg.stroke();
      const n = mission.nodes[mission.cp], s = toS(n.i * P, n.j * P);
      mg.fillStyle = '#fff'; mg.beginPath(); mg.arc(s[0], s[1], 5, 0, 6.2832); mg.fill();
    }
    mg.fillStyle = '#ff9d2d';
    for (const r of rivals) { const s = toS(r.x, r.z); mg.fillRect(s[0] - 3, s[1] - 3, 6, 6); }
    const fl = Math.floor(performance.now() / 200) % 2;
    for (const c of cops) { const s = toS(c.x, c.z); mg.fillStyle = fl ? '#ff3030' : '#3a7bff'; mg.fillRect(s[0] - 3, s[1] - 3, 6, 6); }
    mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(ctr, cy - 8); mg.lineTo(ctr + 5, cy + 5); mg.lineTo(ctr - 5, cy + 5); mg.closePath(); mg.fill();
    mg.restore();
  }
  function updateHUD(dt) {
    hudT += dt; mapT += dt;
    if (cashF > 0 && hudT > 0.09) cashF = 0;
    if (hudT >= 0.1) {
      hudT = 0;
      $('spd').textContent = Math.round(player.speed * 3.6);
      $('gear').textContent = String(clamp(1 + Math.floor(player.speed / (player.def.top / 6)), 1, 6));
      $('nosB').style.width = (player.nitro * 100).toFixed(0) + '%';
      $('cash').textContent = '$ ' + save.cash.toLocaleString('pt-BR');
      $('carName').textContent = player.def.name;
      const m = mission;
      if (m && !m.done) {
        if (m.type === 'race') {
          $('mission').textContent = m.ch.name;
          let rank = 1; const ps = routeS(player, m.cp, m.nodes);
          for (const r of rivals) if (routeS(r, r.ai.k, m.nodes) > ps) rank++;
          $('pos').textContent = 'Posição ' + rank + '/' + (rivals.length + 1);
          $('timer').textContent = fmt(m.t);
        } else if (m.type === 'time') {
          $('mission').textContent = m.ch.name; $('pos').textContent = 'Checkpoint ' + (m.cp - 1) + '/' + (m.nodes.length - 1);
          $('timer').textContent = fmt(Math.max(0, m.limit));
        } else {
          $('mission').textContent = m.ch.name; $('pos').textContent = 'Despiste a polícia'; $('timer').textContent = fmt(m.t);
        }
      } else { $('mission').textContent = 'Mundo aberto'; $('pos').textContent = ''; $('timer').textContent = ''; }
      $('heat').classList.toggle('hide', !pursuit.on);
      $('bustB').style.width = (clamp(pursuit.bust, 0, 1) * 100).toFixed(0) + '%';
    }
    if (mapT >= 0.05) { mapT = 0; drawMap(); }
  }
  const fmt = s => { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };

  /* ---------------- UI / estados ---------------- */
  function setState(s) {
    prevState = state; state = s;
    ['menu', 'story', 'garage', 'pause', 'result'].forEach(id => $(id).classList.toggle('hide', id !== s));
    $('hud').classList.toggle('hide', !(s === 'playing' || s === 'pause'));
    $('touch').classList.toggle('hide', s !== 'playing');
    if (s !== 'playing') for (const k in touch) { touch[k] = false; }
  }
  function togglePause() {
    if (state === 'playing') {
      $('pGarage').classList.toggle('hide', !!mission);
      $('pRetry').classList.toggle('hide', !mission);
      setState('pause');
    } else if (state === 'pause') setState('playing');
  }
  function toMenu() {
    clearAI(); mission = null; setPlayerCar(save.cur);
    placeCar(player, 0, 0, 0); resetTraffic();
    $('count').textContent = ''; $('msg').textContent = '';
    setState('menu');
  }
  function showResult(title, text, btns) {
    $('rTitle').textContent = title; $('rText').style.whiteSpace = 'pre-line'; $('rText').textContent = text;
    const box = $('rBtns'); box.innerHTML = '';
    btns.forEach(([label, fn]) => {
      const b = document.createElement('button'); b.textContent = label; b.onclick = () => { initAudio(); fn(); }; box.appendChild(b);
    });
    setState('result');
  }
  function openStory() {
    const box = $('chList'); box.innerHTML = '';
    CHAPTERS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'ch';
      b.disabled = i > save.ch;
      b.innerHTML = c.name + '<small>' + (i > save.ch ? 'Bloqueado' : (i < save.ch ? 'Concluído · ' : '') + 'Recompensa $' + c.reward.toLocaleString('pt-BR')) + '</small>';
      b.onclick = () => { initAudio(); startMission(i); };
      box.appendChild(b);
    });
    setState('story');
  }
  function cycleCar() {
    const o = save.owned; if (o.length < 2) { showMsg('Compre mais carros na garagem!', 1500); return; }
    save.cur = o[(o.indexOf(save.cur) + 1) % o.length]; persist();
    const keep = { x: player.x, z: player.z, h: player.h, vx: player.vx, vz: player.vz };
    setPlayerCar(save.cur); Object.assign(player, keep);
    showMsg(player.def.name, 1200);
  }

  let gIdx = 0, gReturn = 'menu';
  function openGarage(ret) {
    gReturn = ret; gIdx = save.cur;
    setState('garage'); renderGarage();
  }
  function renderGarage() {
    const c = CARS[gIdx], owned = save.owned.includes(gIdx);
    setPlayerCar(gIdx, owned ? carColor(gIdx) : c.color);
    $('gName').textContent = c.name;
    const st = (l, v) => '<div class="stat"><span>' + l + '</span><div class="bar"><i style="width:' + v + '%"></i></div></div>';
    $('gStats').innerHTML = st('Velocidade', c.top / 80 * 100) + st('Aceleração', c.acc / 30 * 100) + st('Manobra', c.turn / 2.7 * 100) + st('Aderência', c.grip / 8.5 * 100);
    const sw = $('gSw'); sw.innerHTML = '';
    if (owned) SWATCH.forEach(col => {
      const b = document.createElement('button'); b.className = 'sw';
      b.style.background = '#' + col.toString(16).padStart(6, '0');
      b.onclick = () => { save.colors[gIdx] = col; persist(); renderGarage(); };
      sw.appendChild(b);
    });
    const act = $('gAct');
    if (owned) { act.textContent = save.cur === gIdx ? 'Em uso' : 'Selecionar'; act.disabled = save.cur === gIdx; }
    else { act.textContent = 'Comprar $' + c.price.toLocaleString('pt-BR'); act.disabled = save.cash < c.price; }
    $('gCash').textContent = '$ ' + save.cash.toLocaleString('pt-BR');
  }
  $('gPrev').onclick = () => { gIdx = (gIdx + CARS.length - 1) % CARS.length; renderGarage(); };
  $('gNext').onclick = () => { gIdx = (gIdx + 1) % CARS.length; renderGarage(); };
  $('gAct').onclick = () => {
    if (save.owned.includes(gIdx)) save.cur = gIdx;
    else if (save.cash >= CARS[gIdx].price) { save.cash -= CARS[gIdx].price; save.owned.push(gIdx); save.cur = gIdx; }
    persist(); renderGarage();
  };
  $('gBack').onclick = () => {
    setPlayerCar(save.cur);
    if (gReturn === 'pause') setState('pause'); else setState('menu');
  };

  $('bStory').onclick = () => { initAudio(); openStory(); };
  $('bStoryBack').onclick = () => setState('menu');
  $('bFree').onclick = () => { initAudio(); startFree(); };
  $('bGarage').onclick = () => { initAudio(); openGarage('menu'); };
  $('bQ').onclick = () => { quality = (quality + 1) % 3; applyQuality(); };
  $('bFull').onclick = () => { const e = document.documentElement; (e.requestFullscreen || e.webkitRequestFullscreen || (() => {})).call(e); };
  $('bReset').onclick = () => {
    if (confirm('Apagar todo o progresso?')) { try { localStorage.removeItem('np_save'); } catch (e) {} location.reload(); }
  };
  $('pResume').onclick = togglePause;
  $('pGarage').onclick = () => openGarage('pause');
  $('pRetry').onclick = () => { if (mission) startMission(mission.idx); };
  $('pMenu').onclick = toMenu;
  $('pauseBtn').onclick = togglePause;

  /* ---------------- loop principal ---------------- */
  let last = performance.now(), fpsT = 0, fpsN = 0, tTotal = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    const sdt = Math.min(dt, 0.033);
    tTotal += dt;
    if (state === 'playing') {
      simulate(sdt);
      fpsT += dt; fpsN++;
      if (fpsT > 2.5) {
        if (fpsN / fpsT < 36 && quality > 0) { quality--; applyQuality(); showMsg('Qualidade reduzida: ' + QN[quality], 1800); }
        fpsT = 0; fpsN = 0;
      }
      updateAudio(lastThr);
    } else if (state !== 'pause' && state !== 'result') {
      updateTraffic(sdt);
    }
    updateCamera(sdt);
    const bi = Math.floor(player.x / P), bj = Math.floor(player.z / P);
    if (!lastBlock || lastBlock[0] !== bi || lastBlock[1] !== bj) { lastBlock = [bi, bj]; rebuildWorld(bi, bj); }
    ground.position.set(Math.round(player.x / P) * P, 0, Math.round(player.z / P) * P);
    syncCar(player, sdt);
    for (const r of rivals) syncCar(r, sdt);
    const flash = Math.floor(tTotal * 6) % 2 === 0;
    for (const c of cops) {
      syncCar(c, sdt);
      const bar = c.mesh.userData.bar;
      if (bar) { bar[0].visible = flash; bar[1].visible = !flash; }
    }
    syncTraffic();
    updateMarkers(tTotal);
    if (state === 'playing' || state === 'pause') updateHUD(sdt);
    renderer.render(scene, camera);
  }

  /* ---------------- início ---------------- */
  if (!save.owned.includes(save.cur)) save.cur = 0;
  setPlayerCar(save.cur);
  placeCar(player, 0, 0, 0);
  for (const t of traffic) spawnTraffic(t, true);
  applyQuality();
  setState('menu');
  requestAnimationFrame(frame);
})();
