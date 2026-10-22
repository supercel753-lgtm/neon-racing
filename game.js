'use strict';
(function () {
  /* =====================================================================
     NEON PURSUIT v2 — corrida 3D em mundo aberto (Three.js r128)
     Drift arcade, partículas, skid marks, céu noturno, áudio procedural.
     ===================================================================== */
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const rnd = () => Math.random();
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
  const P = 120, RW = 24, HALF = 12;
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
  const SWATCH = [0xe8b13a, 0x3a7be8, 0xd23a3a, 0x2fbf71, 0x9b59ff, 0xf2f2f2, 0x222222, 0xff7a1a, 0xff3d81, 0x2de2c8];

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
  const FOG = 0x303069;
  renderer.setClearColor(FOG);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG, 90, 350);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 420);
  scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x3a3048, 1.05));
  const sun = new THREE.DirectionalLight(0xffc29a, 0.7);
  sun.position.set(-0.6, 1, -0.4);
  scene.add(sun);

  // shared uniforms for point sprites
  const U = { uScale: { value: 800 }, uFar: { value: 350 } };

  let lastBlock = null;
  function resize() {
    renderer.setPixelRatio(QS[quality].pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  function applyQuality() {
    const q = QS[quality];
    scene.fog.near = q.fog * 0.3; scene.fog.far = q.fog; U.uFar.value = q.fog;
    camera.far = q.fog + 70; camera.updateProjectionMatrix();
    resize();
    lastBlock = null;
    $('bQ').textContent = 'Qualidade: ' + QN[quality];
    try { localStorage.setItem('np_q', String(quality)); } catch (e) {}
  }
  window.addEventListener('resize', resize);

  /* ---------------- céu noturno (cúpula com estrelas e lua) ---------------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uMoon: { value: new THREE.Vector3(-0.5, 0.32, -0.8) } },
      vertexShader: `varying vec3 vD;
        void main(){ vD = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `varying vec3 vD; uniform vec3 uMoon;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vD); float y = d.y;
          vec3 hor = vec3(0.188, 0.188, 0.416), mid = vec3(0.10, 0.12, 0.30), top = vec3(0.02, 0.03, 0.12);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, y));
          c = mix(c, top, smoothstep(0.2, 0.85, y));
          vec2 sp = floor(vec2(atan(d.x, d.z) * 70.0, asin(clamp(d.y, -1.0, 1.0)) * 140.0));
          c += vec3(step(0.9972, h(sp)) * smoothstep(0.08, 0.4, y));
          float m = dot(d, normalize(uMoon));
          c += vec3(1.0, 0.96, 0.85) * smoothstep(0.9984, 0.9991, m);
          c += vec3(0.45, 0.5, 0.9) * pow(max(m, 0.0), 60.0) * 0.35;
          gl_FragColor = vec4(c, 1.0);
        }`
    })
  );
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  /* ---------------- texturas utilitárias ---------------- */
  function radialTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  function beamTex() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 128;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
    const gx = g.createLinearGradient(0, 0, 32, 0);
    gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 32, 128);
    return new THREE.CanvasTexture(c);
  }
  const glowTex = radialTex(), beamT = beamTex();

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
    // grão do asfalto
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (rnd() * 0.06).toFixed(3) + ')';
      g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
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

  /* ---------------- sistema de pontos (partículas / brilhos) ---------------- */
  const PVS = `attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
    uniform float uScale; uniform float uFar; varying vec3 vC; varying float vA;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      float d = -mv.z; gl_PointSize = min(aSize * uScale / max(d, 0.5), 150.0);
      vC = aColor; vA = aAlpha * clamp(1.0 - d / uFar, 0.0, 1.0) * smoothstep(1.2, 7.0, d);
    }`;
  const PFS = `varying vec3 vC; varying float vA;
    void main(){
      float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a;
      if (vA * a < 0.003) discard;
      gl_FragColor = vec4(vC, vA * a);
    }`;
  function makeSystem(max, additive) {
    const s = { max, pos: new Float32Array(max * 3), col: new Float32Array(max * 3), siz: new Float32Array(max), alp: new Float32Array(max) };
    const geo = new THREE.BufferGeometry();
    s.aPos = new THREE.BufferAttribute(s.pos, 3); s.aCol = new THREE.BufferAttribute(s.col, 3);
    s.aSiz = new THREE.BufferAttribute(s.siz, 1); s.aAlp = new THREE.BufferAttribute(s.alp, 1);
    [s.aPos, s.aCol, s.aSiz, s.aAlp].forEach(a => a.setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('position', s.aPos); geo.setAttribute('aColor', s.aCol);
    geo.setAttribute('aSize', s.aSiz); geo.setAttribute('aAlpha', s.aAlp);
    s.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: U, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    }));
    s.points.frustumCulled = false;
    scene.add(s.points);
    s.touch = () => { s.aPos.needsUpdate = s.aCol.needsUpdate = s.aSiz.needsUpdate = s.aAlp.needsUpdate = true; };
    return s;
  }
  function makeEmitter(max, additive) {
    const s = makeSystem(max, additive);
    const vel = new Float32Array(max * 3), life = new Float32Array(max), ml = new Float32Array(max),
      s0 = new Float32Array(max), gr = new Float32Array(max), a0 = new Float32Array(max),
      dr = new Float32Array(max), gv = new Float32Array(max);
    let head = 0;
    s.emit = function (x, y, z, vx, vy, vz, lf, size, grow, r, g, b, a, drag, grav) {
      const i = head; head = (head + 1) % max; const i3 = i * 3;
      s.pos[i3] = x; s.pos[i3 + 1] = y; s.pos[i3 + 2] = z;
      vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
      s.col[i3] = r; s.col[i3 + 1] = g; s.col[i3 + 2] = b;
      life[i] = lf; ml[i] = lf; s0[i] = size; gr[i] = grow; a0[i] = a; dr[i] = drag; gv[i] = grav;
    };
    s.update = function (dt) {
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { s.alp[i] = 0; s.siz[i] = 0; continue; }
        const i3 = i * 3, t = 1 - life[i] / ml[i], k = Math.max(0, 1 - dr[i] * dt);
        vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k + gv[i] * dt; vel[i3 + 2] *= k;
        s.pos[i3] += vel[i3] * dt; s.pos[i3 + 1] += vel[i3 + 1] * dt; s.pos[i3 + 2] += vel[i3 + 2] * dt;
        if (gv[i] < 0 && s.pos[i3 + 1] < 0.05) { s.pos[i3 + 1] = 0.05; vel[i3 + 1] *= -0.3; }
        s.siz[i] = Math.max(0.02, s0[i] + gr[i] * t * ml[i]);
        s.alp[i] = a0[i] * (1 - t) * (1 - t);
      }
      s.touch();
    };
    return s;
  }
  const smoke = makeEmitter(360, false);   // fumaça de pneu
  const fxp = makeEmitter(420, true);      // faíscas, chamas, explosões

  /* brilhos (postes + faróis/lanternas) */
  const MAXB = 420, MAXL = 460, G_DYN = 220, G_MAX = MAXL + G_DYN;
  const glow = makeSystem(G_MAX, true);
  let gn = 0;
  function gpush(x, y, z, r, g, b, size, a) {
    if (gn >= G_DYN) return;
    const i = MAXL + gn++, i3 = i * 3;
    glow.pos[i3] = x; glow.pos[i3 + 1] = y; glow.pos[i3 + 2] = z;
    glow.col[i3] = r; glow.col[i3 + 1] = g; glow.col[i3 + 2] = b; glow.siz[i] = size; glow.alp[i] = a;
  }

  /* ---------------- marcas de pneu ---------------- */
  const SK_N = 1400, skPos = new Float32Array(SK_N * 18);
  const skAttr = new THREE.BufferAttribute(skPos, 3), skGeo = new THREE.BufferGeometry();
  skGeo.setAttribute('position', skAttr);
  const skMesh = new THREE.Mesh(skGeo, new THREE.MeshBasicMaterial({
    color: 0x050507, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  }));
  skMesh.frustumCulled = false; scene.add(skMesh);
  let skHead = 0, skDirty = false;
  const skLast = [null, null];
  function skTri(i, ax, az, bx, bz, cx, cz) {
    const o = i * 9;
    skPos[o] = ax; skPos[o + 1] = 0.03; skPos[o + 2] = az;
    skPos[o + 3] = bx; skPos[o + 4] = 0.03; skPos[o + 5] = bz;
    skPos[o + 6] = cx; skPos[o + 7] = 0.03; skPos[o + 8] = cz;
  }
  function skidAdd(w, x, z, lx, lz) {
    const p = skLast[w], hw = 0.17;
    if (p && Math.abs(p.x - x) + Math.abs(p.z - z) > 0.25) {
      if (Math.abs(p.x - x) + Math.abs(p.z - z) < 8) {
        const a = skHead; skHead = (skHead + 2) % (SK_N * 2);
        skTri(a, p.x + p.lx * hw, p.z + p.lz * hw, p.x - p.lx * hw, p.z - p.lz * hw, x - lx * hw, z - lz * hw);
        skTri((a + 1) % (SK_N * 2), p.x + p.lx * hw, p.z + p.lz * hw, x - lx * hw, z - lz * hw, x + lx * hw, z + lz * hw);
        skDirty = true;
      }
      skLast[w] = { x, z, lx, lz };
    } else if (!p) skLast[w] = { x, z, lx, lz };
  }

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
          float bid = floor(vWP.x / 52.0) * 7.0 + floor(vWP.z / 52.0) * 13.0;
          float hb = fract(sin(bid * 12.9898) * 43758.5453);
          float strip = step(fract(vWP.y / 18.0), 0.035) * step(0.72, hb) * step(6.0, vWP.y);
          vec3 neon = hb > 0.86 ? vec3(1.0, 0.2, 0.55) : vec3(0.1, 0.9, 1.0);
          gl_FragColor.rgb += neon * strip * 1.2;
        }
        #include <fog_fragment>`);
  };
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
        const g3 = m * 3;
        glow.pos[g3] = x - sx * 0.6; glow.pos[g3 + 1] = 8.0; glow.pos[g3 + 2] = z - sz * 0.6;
        glow.col[g3] = 1; glow.col[g3 + 1] = 0.78; glow.col[g3 + 2] = 0.45; glow.siz[m] = 11; glow.alp[m] = 0.5;
        m++;
      }
    }
    for (let k = m; k < MAXL; k++) glow.alp[k] = 0;
    poleM.count = headM.count = m;
    poleM.instanceMatrix.needsUpdate = headM.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- carros (modelo procedural) ---------------- */
  const wheelG = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10).rotateZ(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 8).rotateZ(Math.PI / 2);
  const flatG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const matWheel = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const matRim = new THREE.MeshLambertMaterial({ color: 0xb8bcc8 });
  const matDark = new THREE.MeshLambertMaterial({ color: 0x15161b });
  const matGlass = new THREE.MeshPhongMaterial({ color: 0x1b2430, shininess: 120, specular: 0x8899bb });
  const matTail = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const matHead = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const matRed = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const matBlue = new THREE.MeshBasicMaterial({ color: 0x2060ff });

  function buildCar(def, color, opts) {
    opts = opts || {};
    const g = new THREE.Group(), L = def.len, W = def.wid;
    g.rotation.order = 'YXZ';
    const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x555566 });
    const extra = [];
    const add = (geo, mat, x, y, z, sx, sy, sz) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m;
    };
    add(boxG, bodyMat, 0, 0.55, 0, W, 0.5, L);
    add(boxG, bodyMat, 0, 0.82, L * 0.3, W * 0.96, 0.14, L * 0.36);        // capô
    add(boxG, matGlass, 0, 1.08, -L * 0.06, W * 0.84, 0.5, L * 0.5);
    add(boxG, bodyMat, 0, 1.35, -L * 0.06, W * 0.7, 0.06, L * 0.42);
    add(boxG, matDark, 0, 0.34, L / 2 - 0.02, W * 0.98, 0.2, 0.14);       // parachoque
    add(boxG, matDark, 0, 0.34, -L / 2 + 0.02, W * 0.98, 0.2, 0.14);
    add(boxG, matDark, W / 2 + 0.01, 0.32, 0, 0.05, 0.14, L * 0.5);       // saias
    add(boxG, matDark, -W / 2 - 0.01, 0.32, 0, 0.05, 0.14, L * 0.5);
    add(boxG, bodyMat, W / 2 + 0.12, 0.95, L * 0.14, 0.14, 0.1, 0.22);    // retrovisores
    add(boxG, bodyMat, -W / 2 - 0.12, 0.95, L * 0.14, 0.14, 0.1, 0.22);
    add(boxG, matTail, 0, 0.7, -L / 2 - 0.01, W * 0.86, 0.14, 0.06);
    add(boxG, matHead, 0, 0.66, L / 2 + 0.01, W * 0.86, 0.14, 0.06);
    if (def.spoiler) {
      add(boxG, bodyMat, 0, 1.25, -L / 2 + 0.2, W * 0.9, 0.06, 0.5);
      add(boxG, matDark, W * 0.32, 1.0, -L / 2 + 0.2, 0.06, 0.5, 0.3);
      add(boxG, matDark, -W * 0.32, 1.0, -L / 2 + 0.2, 0.06, 0.5, 0.3);
    }
    const wheels = [], pivots = [];
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const p = new THREE.Group();
      p.position.set(sx * (W / 2 - 0.08), 0.38, sz * L * 0.32);
      const w = new THREE.Mesh(wheelG, matWheel);
      const rim = new THREE.Mesh(rimG, matRim); w.add(rim);
      p.add(w); g.add(p); wheels.push(w); if (sz > 0) pivots.push(p);
    }
    let bar = null;
    if (opts.cop) {
      bar = [add(boxG, matRed, 0.35, 1.45, -L * 0.06, 0.5, 0.14, 0.3), add(boxG, matBlue, -0.35, 1.45, -L * 0.06, 0.5, 0.14, 0.3)];
    }
    if (opts.glow) {   // neon sob o carro
      const um = new THREE.MeshBasicMaterial({ color: opts.cop ? 0x4466ff : color, map: glowTex, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false });
      const u = new THREE.Mesh(flatG, um); u.position.y = 0.04; u.scale.set(W * 1.9, 1, L * 1.35); g.add(u); extra.push(um);
    }
    if (opts.beam) {   // cone de luz do farol
      const bmt = new THREE.MeshBasicMaterial({ color: 0xfff0c8, map: beamT, transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const b = new THREE.Mesh(flatG, bmt); b.position.set(0, 0.06, L / 2 + 11); b.scale.set(9, 1, 22); g.add(b); extra.push(bmt);
    }
    g.userData = { bodyMat, extra, wheels, pivots, bar, roll: 0, pitch: 0 };
    return g;
  }
  function killMesh(m) {
    if (!m) return;
    scene.remove(m);
    if (m.userData) {
      if (m.userData.bodyMat) m.userData.bodyMat.dispose();
      if (m.userData.extra) m.userData.extra.forEach(x => x.dispose());
    }
  }

  /* ---------------- estado dos carros ---------------- */
  function newCar(def, isPlayer) {
    return { def, x: 0, z: 0, h: 0, vx: 0, vz: 0, steer: 0, speed: 0, vf: 0, vl: 0, sa: 0, ax: 0, boost: false, kick: 0,
      drift: false, nitro: 1, contact: false, hitX: 0, hitZ: 0, isPlayer: !!isPlayer, mesh: null };
  }
  const player = newCar(CARS[0], true);
  function carColor(idx) { return save.colors[idx] != null ? save.colors[idx] : CARS[idx].color; }
  function setPlayerCar(idx, colorOverride) {
    killMesh(player.mesh);
    player.def = CARS[idx];
    player.mesh = buildCar(CARS[idx], colorOverride != null ? colorOverride : carColor(idx), { glow: true, beam: true });
    scene.add(player.mesh);
  }
  function placeCar(c, x, z, h) {
    c.x = x; c.z = z; c.h = h; c.vx = c.vz = 0; c.steer = 0; c.speed = c.vf = c.vl = c.sa = 0; c.boost = false; c.kick = 0; c.drift = false;
  }

  /* ---------------- física arcade com drift ---------------- */
  function carStep(c, inp, dt) {
    const d = c.def, top = d.top * (c.boost ? 1.3 : 1);
    let fx = Math.sin(c.h), fz = Math.cos(c.h);
    let vf = c.vx * fx + c.vz * fz;
    const vl0 = c.vx * fz - c.vz * fx;
    const sp = Math.abs(vf);
    const sa0 = vf > 2 ? clamp(Math.atan2(vl0, vf), -1.4, 1.4) : 0;
    // gatilhos de drift (só o jogador): freio de mão ou curva forte em alta velocidade
    if (c.isPlayer) {
      const hbOn = inp.hb && sp > 9;
      const power = Math.abs(inp.steer) > 0.55 && inp.thr > 0 && vf > d.top * 0.5;
      if (hbOn || power) c.drift = true;
      else if (c.drift && (Math.abs(sa0) < 0.1 || sp < 8)) c.drift = false;
      if (sp < 6) c.drift = false;
    } else c.drift = false;
    c.steer += (inp.steer - c.steer) * Math.min(1, dt * (c.drift ? 14 : 9));
    const dirF = clamp(vf / 5, -1, 1);
    let yaw;
    if (c.drift) yaw = -c.steer * d.turn * 1.7 * dirF / (1 + sp / 60) + sa0 * (inp.hb ? 2.6 : 3.6);
    else {
      yaw = -c.steer * d.turn * dirF / (1 + sp / 38);
      if (inp.hb) yaw *= 1.45;
    }
    c.h += yaw * dt;
    fx = Math.sin(c.h); fz = Math.cos(c.h);
    const lx = fz, lz = -fx;
    vf = c.vx * fx + c.vz * fz;
    let a = 0;
    if (inp.thr > 0) {
      const r = clamp(vf / top, 0, 1.2);
      a = inp.thr * d.acc * (1 - r * r * 0.95) * (vf < 0 ? 2 : 1) * (c.drift ? 1.15 : 1);
    } else if (inp.thr < 0) {
      a = vf > 1 ? inp.thr * 30 : inp.thr * 9 * (1 - clamp(-vf / 14, 0, 1));
    }
    if (c.boost && vf > 0) a += 20;
    if (c.kick > 0) { if (vf > 0) a += 26; c.kick -= dt; }
    if (inp.hb && Math.abs(vf) > 1) a -= Math.sign(vf) * (c.drift ? 2 : 8);
    a -= vf * 0.04 + (Math.abs(vf) > 0.5 ? Math.sign(vf) * 0.6 : 0);
    c.ax = a;
    c.vx += fx * a * dt; c.vz += fz * a * dt;
    const vl = c.vx * lx + c.vz * lz;
    const gm = c.drift ? (inp.hb ? 0.2 : 0.3) : (inp.hb ? 0.22 : 1);
    const rem = vl * (1 - Math.exp(-d.grip * gm * dt));
    c.vx -= lx * rem; c.vz -= lz * rem;
    if (c.drift && Math.hypot(c.vx, c.vz) < top * 1.15) {   // o drift preserva a velocidade
      const g = Math.abs(rem) * 0.5;
      c.vx += fx * g; c.vz += fz * g;
    }
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.speed = Math.hypot(c.vx, c.vz);
    c.vf = c.vx * fx + c.vz * fz;
    c.vl = vl;
    c.sa = c.vf > 2 ? clamp(Math.atan2(vl, c.vf), -1.4, 1.4) : 0;
  }

  function collideBuildings(c) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h), r = c.def.wid * 0.5 + 0.15;
    let hit = 0;
    c.contact = false;
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
        c.contact = true; c.hitX = cx; c.hitZ = cz;
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
    traffic.push({ axis: 0, dir: 1, road: 0, lane: 4.5, s: 0, spd: 10, slow: 0, nm: 0, x: 0, z: 0, h: 0, vx: 0, vz: 0 });
    tBody.setColorAt(i, TCOL[i % TCOL.length]);
  }
  function placeTraffic(t) {
    t.x = t.axis === 0 ? t.s : t.road * P - t.dir * 4.5;
    t.z = t.axis === 0 ? t.road * P + t.dir * 4.5 : t.s;
    t.h = t.axis === 0 ? t.dir * Math.PI / 2 : (t.dir > 0 ? 0 : Math.PI);
  }
  function spawnTraffic(t, initial) {
    t.axis = rnd() < 0.5 ? 0 : 1;
    t.dir = rnd() < 0.5 ? 1 : -1;
    const perp = t.axis === 0 ? player.z : player.x, along = t.axis === 0 ? player.x : player.z;
    t.road = Math.round(perp / P) + Math.floor(rnd() * 7) - 3;
    t.s = along + (initial ? (rnd() - 0.5) * 620 : (rnd() < 0.5 ? -1 : 1) * (270 + rnd() * 60));
    if (initial && Math.abs(t.s - along) < 40) t.s += 80;
    t.spd = 9 + rnd() * 8; t.slow = 0; t.nm = 0;
    placeTraffic(t);
  }
  function updateTraffic(dt) {
    for (const t of traffic) {
      t.s += t.dir * t.spd * (t.slow > 0 ? 0.3 : 1) * dt;
      t.slow -= dt; if (t.nm > 0) t.nm -= dt;
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

  /* ---------------- áudio procedural: motor, pneu, vento, sirene, música ---------------- */
  let AC = null, master = null, sfxG = null, musG = null, muted = false, musicOn = true;
  const A = { gear: undefined, shift: 0 };
  let state = 'menu';
  function loopNoise(type, f, q) {
    const s = AC.createBufferSource(); s.buffer = A.nb; s.loop = true;
    const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = AC.createGain(); g.gain.value = 0;
    s.connect(fl); fl.connect(g); g.connect(sfxG); s.start();
    return { f: fl, g };
  }
  function initAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
      sfxG = AC.createGain(); sfxG.connect(master);
      musG = AC.createGain(); musG.gain.value = 0.5; musG.connect(master);
      const nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.nb = nb;
      A.o1 = AC.createOscillator(); A.o1.type = 'sawtooth';
      A.o2 = AC.createOscillator(); A.o2.type = 'square';
      A.ef = AC.createBiquadFilter(); A.ef.type = 'lowpass'; A.ef.frequency.value = 500;
      A.eg = AC.createGain(); A.eg.gain.value = 0;
      A.o1.connect(A.ef); A.o2.connect(A.ef); A.ef.connect(A.eg); A.eg.connect(sfxG);
      A.o1.start(); A.o2.start();
      A.tu = AC.createOscillator(); A.tu.type = 'sine'; A.tg = AC.createGain(); A.tg.gain.value = 0;
      A.tu.connect(A.tg); A.tg.connect(sfxG); A.tu.start();
      A.tire = loopNoise('bandpass', 1500, 3);
      A.wind = loopNoise('lowpass', 500, 0.7);
      A.nos = loopNoise('highpass', 1800, 0.7);
      A.sir = AC.createOscillator(); A.sir.type = 'triangle'; A.sir.frequency.value = 700;
      A.sg = AC.createGain(); A.sg.gain.value = 0;
      const lfo = AC.createOscillator(); lfo.frequency.value = 1.4;
      const lg = AC.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(A.sir.frequency); A.sir.connect(A.sg); A.sg.connect(sfxG);
      A.sir.start(); lfo.start();
      mNext = AC.currentTime + 0.1; mStep = 0;
      setInterval(musicTick, 70);
    } catch (e) { AC = null; }
  }
  function env(g, t, a, dur, vol) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(dest, type, f0, f1, t, dur, vol, lp) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.01, dur, vol);
    if (lp) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); f.connect(g); }
    else o.connect(g);
    g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noiseHit(dest, type, f, q, t, dur, vol) {
    const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = A.nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    env(g, t, 0.005, dur, vol);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random(), dur + 0.05);
  }
  const ok = () => AC && !muted;
  function sfxCrash(v) {
    if (!ok()) return; const t = AC.currentTime, vol = clamp(v / 22, 0.15, 0.8);
    noiseHit(sfxG, 'lowpass', 900, 0.7, t, 0.35, vol);
    tone(sfxG, 'sine', 120, 38, t, 0.3, vol * 0.9);
  }
  function sfxClick() { if (!ok()) return; tone(sfxG, 'square', 660, 880, AC.currentTime, 0.07, 0.07, 3000); }
  function sfxCount(go) { if (!ok()) return; tone(sfxG, 'square', go ? 880 : 440, go ? 1320 : 440, AC.currentTime, go ? 0.5 : 0.18, 0.12, 2500); }
  function sfxCheckpoint() {
    if (!ok()) return; const t = AC.currentTime;
    tone(sfxG, 'triangle', 880, 880, t, 0.12, 0.14); tone(sfxG, 'triangle', 1318, 1318, t + 0.09, 0.2, 0.14);
  }
  function sfxBank() {
    if (!ok()) return; const t = AC.currentTime;
    [660, 880, 1100, 1320].forEach((f, i) => tone(sfxG, 'square', f, f, t + i * 0.06, 0.12, 0.07, 3500));
  }
  function sfxNear() { if (!ok()) return; noiseHit(sfxG, 'bandpass', 2500, 1.2, AC.currentTime, 0.25, 0.14); }
  function sfxKick() { if (!ok()) return; const t = AC.currentTime; noiseHit(sfxG, 'highpass', 1500, 0.8, t, 0.6, 0.22); tone(sfxG, 'sawtooth', 90, 260, t, 0.5, 0.1, 1200); }
  function sfxWin() {
    if (!ok()) return; const t = AC.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => tone(sfxG, 'triangle', f, f, t + i * 0.12, 0.35, 0.16));
  }
  function sfxLose() {
    if (!ok()) return; const t = AC.currentTime;
    [392, 330, 262].forEach((f, i) => tone(sfxG, 'sawtooth', f, f * 0.97, t + i * 0.2, 0.4, 0.1, 1200));
  }
  function updateAudio(thr, dt) {
    if (!AC) return;
    const t = AC.currentTime, on = state === 'playing' && !muted;
    const sp = player.speed, top = player.def.top, gs = top / 6;
    const gear = Math.min(6, 1 + Math.floor(sp / gs));
    if (gear !== A.gear) { if (A.gear !== undefined && gear > A.gear) A.shift = 0.14; A.gear = gear; }
    A.shift = Math.max(0, A.shift - dt);
    let rpm = 0.2 + 0.8 * clamp((sp - (gear - 1) * gs) / gs, 0, 1);
    if (sp < 1) rpm = 0.15 + (thr > 0 ? 0.3 : 0);
    if (thr > 0) rpm += 0.05;
    if (A.shift > 0) rpm -= 0.25;
    const f = 38 + rpm * 165;
    A.o1.frequency.setTargetAtTime(f, t, 0.04); A.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    A.ef.frequency.setTargetAtTime(350 + rpm * 1400 + (thr > 0 ? 500 : 0), t, 0.05);
    A.eg.gain.setTargetAtTime(on ? 0.04 + 0.05 * rpm + (thr > 0 ? 0.02 : 0) : 0, t, 0.08);
    A.tu.frequency.setTargetAtTime(1200 + rpm * 2600, t, 0.05);
    A.tg.gain.setTargetAtTime(on && thr > 0 ? 0.006 + 0.012 * rpm : 0, t, 0.1);
    const sl = sp > 6 ? Math.max(clamp((Math.abs(player.vl) - 2) / 9, 0, 1), thr < 0 && player.vf > 14 ? 0.45 : 0) : 0;
    A.tire.g.gain.setTargetAtTime(on ? sl * 0.2 : 0, t, 0.05);
    A.tire.f.frequency.setTargetAtTime(1000 + sp * 16 + sl * 500, t, 0.08);
    A.wind.g.gain.setTargetAtTime(on ? Math.pow(clamp(sp / top, 0, 1.3), 2) * 0.1 : 0, t, 0.1);
    A.wind.f.frequency.setTargetAtTime(300 + sp * 18, t, 0.1);
    A.nos.g.gain.setTargetAtTime(on && (player.boost || player.kick > 0) ? 0.12 : 0, t, 0.05);
    let dn = 1e9;
    for (const c of cops) if (c.mode === 'chase') { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < dn) dn = d; }
    A.sg.gain.setTargetAtTime(on && dn < 260 ? 0.035 * (1 - dn / 260) : 0, t, 0.2);
    musG.gain.setTargetAtTime(muted || !musicOn ? 0 : (state === 'playing' ? 0.5 : state === 'pause' ? 0.2 : 0.75), t, 0.3);
  }

  // música synthwave procedural
  let mNext = 0, mStep = 0;
  const ROOTS = [45, 41, 48, 43], CHORD = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], ARP = [0, 1, 2, 1, 2, 1, 0, 2];
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  function musicTick() {
    if (!AC) return;
    if (muted || !musicOn) { mNext = Math.max(mNext, AC.currentTime + 0.05); return; }
    const spb = 60 / 118 / 4;
    while (mNext < AC.currentTime + 0.3) { playStep(mStep, mNext); mNext += spb; mStep = (mStep + 1) % 64; }
  }
  function playStep(s, t) {
    const bar = (s >> 4) & 3, st = s & 15, root = ROOTS[bar], ch = CHORD[bar];
    if (st % 4 === 0) { tone(musG, 'sine', 160, 45, t, 0.18, 0.55); }
    if (st % 2 === 1) noiseHit(musG, 'highpass', 7000, 0.7, t, 0.04, st % 4 === 3 ? 0.07 : 0.04);
    if (st === 4 || st === 12) noiseHit(musG, 'bandpass', 1800, 0.8, t, 0.14, 0.2);
    if (st % 2 === 0) tone(musG, 'sawtooth', mtof(root + (st % 8 === 6 ? 12 : 0)), 0, t, 0.2, 0.16, 500);
    tone(musG, 'square', mtof(root + 24 + ch[ARP[st % 8]] + (bar % 2 ? 12 : 0)), 0, t, 0.11, 0.03, 2600);
    if (st === 0) for (const iv of ch) {
      tone(musG, 'sawtooth', mtof(root + 12 + iv), 0, t, 2.0, 0.035, 800);
      tone(musG, 'sawtooth', mtof(root + 12 + iv) * 1.004, 0, t, 2.0, 0.03, 800);
    }
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
    else if (e.code === 'KeyN') { musicOn = !musicOn; showMsg('Música ' + (musicOn ? 'ligada' : 'desligada'), 1000); }
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
  document.addEventListener('click', e => { if (e.target && e.target.tagName === 'BUTTON') { initAudio(); sfxClick(); } });
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
  function pairCollide(a, b) {
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
  function nearMiss() {
    if (player.speed < 22) return;
    for (const t of traffic) {
      if (t.nm > 0 || t.slow > 0) continue;
      const dx = player.x - t.x, dz = player.z - t.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      const d = Math.hypot(dx, dz);
      if (d > 3.3 && d < 5.4) {
        t.nm = 2.5;
        player.nitro = Math.min(1, player.nitro + 0.07);
        D.pts += 250 * D.mult; save.cash += 20;
        showMsg('PASSOU RASPANDO!', 700); sfxNear();
      }
    }
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
  let mission = null, prevState = 'menu';
  const rivals = [], cops = [];
  const pursuit = { on: false, level: 1, t: 0, far: 0, bust: 0, spawnT: 0 };
  let patrolT = 20;
  const D = { pts: 0, mult: 1, time: 0, t: 0 };
  const resetDrift = () => { D.pts = 0; D.mult = 1; D.time = 0; D.t = 0; };

  function genRoute(idx, steps) {
    const rng = mulberry(1000 + idx * 77);
    let i = Math.floor((rng() - 0.5) * 20), j = Math.floor((rng() - 0.5) * 20);
    const nodes = [{ i, j }];
    const DD = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let d = Math.floor(rng() * 4);
    for (let s = 0; s < steps; s++) {
      const r = rng();
      if (r < 0.22) d = (d + 1) % 4; else if (r < 0.44) d = (d + 3) % 4;
      i += DD[d][0]; j += DD[d][1]; nodes.push({ i, j });
    }
    return nodes;
  }
  function clearAI() {
    for (const r of rivals) killMesh(r.mesh);
    for (const c of cops) killMesh(c.mesh);
    rivals.length = 0; cops.length = 0;
    pursuit.on = false; pursuit.bust = 0; pursuit.t = 0; pursuit.far = 0;
    patrolT = 20; resetDrift();
  }
  function resetTraffic() { for (const t of traffic) spawnTraffic(t, true); }

  function startFree() {
    clearAI(); mission = null;
    setPlayerCar(save.cur);
    placeCar(player, 0, 0, 0); player.nitro = 1;
    resetTraffic();
    setState('playing');
    showMsg('Mundo aberto — drifte, ganhe nitro e cuidado com a polícia!', 3000);
  }
  function startMission(idx) {
    clearAI();
    const ch = CHAPTERS[idx];
    setPlayerCar(save.cur);
    const nodes = genRoute(idx, ch.steps || 8);
    const n0 = nodes[0], n1 = nodes[1];
    const h = Math.atan2(n1.i - n0.i, n1.j - n0.j);
    const fx = Math.sin(h), fz = Math.cos(h), lx = fz, lz = -fx;
    mission = { idx, ch, type: ch.type, nodes, cp: 1, cd: 3.6, t: 0, limit: 0, done: false };
    placeCar(player, n0.i * P - fx * 8, n0.j * P - fz * 8, h); player.nitro = 1;
    if (ch.type === 'time') mission.limit = (ch.steps * P) / (player.def.top * 0.6) + 8;
    if (ch.type === 'race') {
      for (let r = 0; r < ch.rivals; r++) {
        const base = CARS[(idx + r + 1) % CARS.length];
        const skill = 0.9 + 0.03 * idx + r * 0.015;
        const def = Object.assign({}, base, {
          top: player.def.top * skill, acc: Math.max(base.acc * 0.8, player.def.acc * skill), turn: base.turn, grip: base.grip
        });
        const c = newCar(def, false);
        const lat = (r % 2 === 0 ? -1 : 1) * 4, back = 8 + 7 * Math.floor(r / 2) + 6;
        placeCar(c, n0.i * P - fx * back + lx * lat, n0.j * P - fz * back + lz * lat, h);
        c.mesh = buildCar(def, SWATCH[(r * 3 + idx + 2) % SWATCH.length], { glow: quality > 0, beam: quality > 0 });
        scene.add(c.mesh);
        c.ai = { k: 1, skill, stuck: 0, finished: false };
        rivals.push(c);
      }
    }
    if (ch.type === 'escape') { placeCar(player, n0.i * P, n0.j * P, h); mission.cd = 2.2; }
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
      title = 'VITÓRIA!'; sfxWin();
      if (m.idx + 1 < CHAPTERS.length) btns.push(['Próximo capítulo', () => startMission(m.idx + 1)]);
      else btns.push(['Final do jogo — mundo aberto', startFree]);
    } else {
      title = 'DERROTA'; sfxLose();
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
    const c = newCar(def, false);
    placeCar(c, i * P, j * P, 0);
    c.mesh = buildCar(def, 0xf2f2f2, { cop: true, glow: quality > 0, beam: quality > 0 }); scene.add(c.mesh);
    c.mode = chase ? 'chase' : 'patrol';
    c.prev = null; c.cur = null; c.next = null; c.stuck = 0;
    cops.push(c);
    return c;
  }
  function spawnCopAround(chase, minD, maxD) {
    for (let tries = 0; tries < 20; tries++) {
      const a = rnd() * Math.PI * 2, d = minD + rnd() * (maxD - minD);
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
      const d = Math.hypot(ni * P - player.x, nj * P - player.z) + rnd() * 10;
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
      const rw = 800 * lvl; save.cash += rw; persist(); sfxWin();
      showMsg('VOCÊ ESCAPOU! +$' + rw, 3000);
    }
  }
  function busted() {
    if (mission && mission.type === 'escape') { endPursuit(false); finishMission(false, 'Você foi preso!'); return; }
    const fine = Math.min(Math.round(save.cash * 0.1), 2500);
    save.cash -= fine; persist();
    endPursuit(false);
    respawnPlayer(); sfxLose();
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
    resetDrift();
    if (mission && mission.nodes && mission.type !== 'escape') {
      const a = mission.nodes[Math.max(0, mission.cp - 1)], b = mission.nodes[mission.cp];
      placeCar(player, a.i * P, a.j * P, Math.atan2(b.i - a.i, b.j - a.j));
      camH = player.h;
      return;
    }
    const ri = Math.round(player.x / P) * P, rj = Math.round(player.z / P) * P;
    if (Math.abs(player.x - ri) < Math.abs(player.z - rj)) placeCar(player, ri, player.z, Math.cos(player.h) >= 0 ? 0 : Math.PI);
    else placeCar(player, player.x, rj, Math.sin(player.h) >= 0 ? Math.PI / 2 : -Math.PI / 2);
    camH = player.h;
  }

  /* ---------------- VFX do jogador ---------------- */
  let smokeAcc = 0, sparkAcc = 0, flameAcc = 0, scrapeAcc = 0, lastHb = false;
  function burst(x, z, r, g, b) {
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * 6.2832;
      fxp.emit(x + Math.cos(a) * 5, 0.6, z + Math.sin(a) * 5, Math.cos(a) * 3, 5 + rnd() * 7, Math.sin(a) * 3, 0.9, 1.4, -1.2, r, g, b, 0.95, 0.5, -6);
    }
  }
  function playerFX(dt) {
    const c = player, fx = Math.sin(c.h), fz = Math.cos(c.h), lx = fz, lz = -fx, L = c.def.len, W = c.def.wid, sp = c.speed;
    const brakeSkid = lastThr < 0 && c.vf > 18;
    let s = 0;
    if (sp > 5) s = Math.max(clamp((Math.abs(c.vl) - 2.0) / 8, 0, 1), lastHb && sp > 8 ? 0.7 : 0, brakeSkid ? 0.5 : 0);
    c.slipFx = s;
    const rx = c.x - fx * L * 0.32, rz = c.z - fz * L * 0.32, off = W / 2 - 0.08;
    const wlx = rx + lx * off, wlz = rz + lz * off, wrx = rx - lx * off, wrz = rz - lz * off;
    if (s > 0.12) {
      skidAdd(0, wlx, wlz, lx, lz); skidAdd(1, wrx, wrz, lx, lz);
      smokeAcc += dt * (quality ? 36 : 18) * s;
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        const left = rnd() < 0.5, wx = left ? wlx : wrx, wz = left ? wlz : wrz;
        smoke.emit(wx, 0.25, wz, c.vx * 0.25 + (rnd() - 0.5) * 1.6, 0.6 + rnd() * 1.2, c.vz * 0.25 + (rnd() - 0.5) * 1.6,
          1.0 + rnd() * 0.9, 1.0 + rnd() * 0.6, 2.8, 0.86, 0.86, 0.92, 0.42, 1.2, 0);
      }
      if (s > 0.55 && sp > 12) {
        sparkAcc += dt * 26 * s;
        while (sparkAcc >= 1) {
          sparkAcc -= 1;
          const left = rnd() < 0.5;
          fxp.emit(left ? wlx : wrx, 0.12, left ? wlz : wrz, c.vx * 0.5 - fx * (2 + rnd() * 4) + (rnd() - 0.5) * 3, 1 + rnd() * 2.5, c.vz * 0.5 - fz * (2 + rnd() * 4) + (rnd() - 0.5) * 3,
            0.35 + rnd() * 0.25, 0.22, -0.2, 1, 0.65, 0.2, 1, 0.4, -9);
        }
      }
    } else { skLast[0] = skLast[1] = null; }
    if (c.boost || c.kick > 0) {
      flameAcc += dt * 170;
      while (flameAcc >= 1) {
        flameAcc -= 1;
        const side = (rnd() - 0.5) * 0.8;
        fxp.emit(c.x - fx * (L / 2 + 0.2) + lx * side, 0.55, c.z - fz * (L / 2 + 0.2) + lz * side,
          c.vx * 0.85 - fx * (6 + rnd() * 4) + (rnd() - 0.5), (rnd() - 0.5) * 0.8, c.vz * 0.85 - fz * (6 + rnd() * 4) + (rnd() - 0.5),
          0.22 + rnd() * 0.2, 0.9, -1.6, 0.45, 0.75, 1, 0.95, 0.5, 0);
      }
    }
    if (c.contact && sp > 6) {
      scrapeAcc += dt * 90 * clamp(sp / 30, 0.3, 1.5);
      while (scrapeAcc >= 1) {
        scrapeAcc -= 1;
        fxp.emit(c.hitX, 0.3 + rnd() * 0.8, c.hitZ, (rnd() - 0.5) * 8, 1 + rnd() * 4, (rnd() - 0.5) * 8, 0.3 + rnd() * 0.3, 0.2, -0.2, 1, 0.7, 0.25, 1, 0.3, -10);
      }
    }
  }
  function impactFX(imp) {
    const n = Math.min(40, Math.floor(imp * 2));
    for (let i = 0; i < n; i++) {
      fxp.emit(player.x, 0.7, player.z, (rnd() - 0.5) * 14, 2 + rnd() * 6, (rnd() - 0.5) * 14, 0.4 + rnd() * 0.4, 0.25, -0.25, 1, 0.75, 0.3, 1, 0.3, -12);
    }
    for (let i = 0; i < 6; i++) smoke.emit(player.x, 0.8, player.z, (rnd() - 0.5) * 3, 1 + rnd() * 2, (rnd() - 0.5) * 3, 1.2, 1.4, 3, 0.55, 0.55, 0.6, 0.4, 1.2, 0);
  }

  /* ---------------- drift: pontos, combo e bônus ---------------- */
  function bankDrift() {
    if (D.pts >= 100) {
      const cash = Math.floor(D.pts / 5);
      save.cash += cash; persist();
      player.nitro = Math.min(1, player.nitro + Math.min(0.5, D.pts / 6000));
      if (D.pts > 1500) { player.kick = Math.min(1.2, D.pts / 2500); sfxKick(); }
      showMsg('DRIFT +' + Math.floor(D.pts) + '   ($' + cash + ')', 1500);
      sfxBank();
      for (let i = 0; i < 24; i++) fxp.emit(player.x, 1.5, player.z, (rnd() - 0.5) * 8, 3 + rnd() * 5, (rnd() - 0.5) * 8, 0.8, 0.5, -0.4, 1, 0.85, 0.3, 0.9, 0.4, -6);
    }
    resetDrift();
  }
  function updateDrift(dt) {
    const drifting = player.drift && Math.abs(player.sa) > 0.28 && player.speed > 12;
    if (drifting) {
      D.t = 0; D.time += dt; D.mult = 1 + Math.min(7, Math.floor(D.time / 1.2));
      D.pts += player.speed * Math.abs(player.sa) * dt * 6 * D.mult;
      player.nitro = Math.min(1, player.nitro + dt * 0.12);
    } else if (D.pts > 0) {
      D.t += dt;
      if (D.t > 1.1 || player.speed < 5) bankDrift();
    }
  }

  /* ---------------- loop de simulação ---------------- */
  let shake = 0, camH = 0, orbit = 0, lastThr = 0, camRoll = 0;
  function simulate(dt) {
    const inp = readInput();
    lastThr = inp.thr; lastHb = inp.hb;
    const frozen = !!(mission && mission.cd > 0);
    if (mission && !mission.done && mission.cd > 0) {
      const before = Math.ceil(mission.cd);
      mission.cd -= dt;
      const now = Math.ceil(mission.cd);
      if (mission.cd <= 0) { showCount('GO!'); sfxCount(true); }
      else if (now !== before || mission.cd > 3.55) { showCount(String(now)); sfxCount(false); }
    }
    if (frozen) { player.vx = player.vz = 0; player.speed = 0; player.vf = 0; }
    else {
      const wantN = inp.nos && player.nitro > 0.02 && player.vf > 3;
      player.boost = wantN;
      if (wantN) player.nitro = Math.max(0, player.nitro - dt * 0.3);
      else player.nitro = Math.min(1, player.nitro + dt * 0.03);
      carStep(player, inp, dt);
      updateDrift(dt);
    }
    let imp = collideBuildings(player);
    updateTraffic(dt);
    imp = Math.max(imp, trafficCollide(player));
    nearMiss();
    for (const r of rivals) { updateRival(r, dt, frozen); trafficCollide(r); }
    for (const c of cops) { updateCop(c, dt); trafficCollide(c); }
    const dyn = [player].concat(rivals, cops);
    for (let i = 0; i < dyn.length; i++) for (let j = i + 1; j < dyn.length; j++) {
      const v = pairCollide(dyn[i], dyn[j]);
      if (v > 0 && i === 0) {
        imp = Math.max(imp, v);
        if (cops.includes(dyn[j]) && dyn[j].mode === 'patrol') { dyn[j].mode = 'chase'; startPursuit(); }
      }
    }
    if (imp > 3) { shake = Math.min(1, shake + imp * 0.03); sfxCrash(imp); impactFX(imp); }
    if (imp > 6 && D.pts > 0) { showMsg('Drift perdido!', 900); resetDrift(); }
    if (mission && !mission.done && !frozen) {
      const m = mission;
      m.t += dt;
      if (m.type !== 'escape') {
        const n = m.nodes[m.cp];
        if (nodeDist(player, n) < 16) {
          burst(n.i * P, n.j * P, 0.2, 1, 0.9); sfxCheckpoint();
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
    playerFX(dt);
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
    if (spd > 8 && player.vf > -1) {
      const w = (player.drift ? 0.55 : 0.35) * Math.min(1, (spd - 8) / 20);
      th = player.h + wrapA(Math.atan2(player.vx, player.vz) - player.h) * w;
    }
    camH += wrapA(th - camH) * Math.min(1, dt * (player.drift ? 4 : 5));
    const boosting = player.boost || player.kick > 0;
    const dist = 7 + spd * 0.045 + (boosting ? 1.8 : 0);
    const fx = Math.sin(camH), fz = Math.cos(camH);
    const sk = shake * 0.8 + (boosting ? 0.1 : 0) + (spd > player.def.top * 0.85 ? 0.04 : 0);
    const sx = (rnd() - 0.5) * sk, sy = (rnd() - 0.5) * sk * 0.6;
    camera.position.set(player.x - fx * dist + sx, 2.7 + spd * 0.012 + sy, player.z - fz * dist);
    camera.lookAt(player.x + fx * 8, 1.3, player.z + fz * 8);
    const rollT = player.drift ? clamp(-player.sa * 0.1, -0.16, 0.16) : 0;
    camRoll += (rollT - camRoll) * Math.min(1, dt * 5);
    camera.rotateZ(camRoll);
    const tf = 62 + spd * 0.35 + (boosting ? 14 : 0) + (player.drift ? 4 : 0);
    if (Math.abs(camera.fov - tf) > 0.15) { camera.fov += (tf - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }

  /* ---------------- sincronização visual ---------------- */
  function syncCar(c, dt) {
    const m = c.mesh;
    if (!m) return;
    const u = m.userData, sf = clamp(c.speed / 40, 0, 1);
    const rollT = -clamp(c.vl * 0.006 + c.steer * 0.03 * sf, -0.1, 0.1);
    const pitchT = -clamp(c.ax * 0.004, -0.05, 0.07);
    const k = Math.min(1, dt * 8);
    u.roll += (rollT - u.roll) * k; u.pitch += (pitchT - u.pitch) * k;
    m.position.set(c.x, 0, c.z);
    m.rotation.y = c.h; m.rotation.x = u.pitch; m.rotation.z = u.roll;
    const spin = c.vf * dt / 0.38;
    for (let i = 0; i < u.wheels.length; i++) u.wheels[i].rotation.x += spin;
    for (let i = 0; i < u.pivots.length; i++) u.pivots[i].rotation.y = -c.steer * 0.4;
  }
  const beam1 = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2de2c8, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  const beam2 = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4d8bff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  beam1.visible = beam2.visible = false; scene.add(beam1); scene.add(beam2);
  function updateMarkers(t) {
    const m = mission;
    if (!m || m.done || m.type === 'escape') { beam1.visible = beam2.visible = false; return; }
    const a = m.nodes[m.cp], b = m.nodes[m.cp + 1];
    beam1.visible = true; beam1.position.set(a.i * P, 30, a.j * P);
    const s = 1 + 0.08 * Math.sin(t * 6); beam1.scale.set(s, 1, s);
    if (b) { beam2.visible = true; beam2.position.set(b.i * P, 20, b.j * P); } else beam2.visible = false;
  }

  // brilhos dinâmicos: faróis/lanternas do trânsito, carros e giroflex da polícia
  function tailGlow(x, z, h, L, W, big) {
    const f = Math.sin(h), g = Math.cos(h), ox = g * W * 0.35, oz = -f * W * 0.35;
    const bx = x - f * (L / 2 + 0.05), bz = z - g * (L / 2 + 0.05), hx = x + f * (L / 2 + 0.05), hz = z + g * (L / 2 + 0.05);
    const ts = big ? 3.0 : 1.5, ta = big ? 1 : 0.85;
    gpush(bx + ox, 0.75, bz + oz, 1, 0.1, 0.1, ts, ta); gpush(bx - ox, 0.75, bz - oz, 1, 0.1, 0.1, ts, ta);
    gpush(hx + ox, 0.7, hz + oz, 1, 0.95, 0.75, 2.4, 0.8); gpush(hx - ox, 0.7, hz - oz, 1, 0.95, 0.75, 2.4, 0.8);
  }
  function glowFrame(flash) {
    gn = 0;
    for (const t of traffic) {
      if (Math.abs(t.x - player.x) < 260 && Math.abs(t.z - player.z) < 260) tailGlow(t.x, t.z, t.h, 4, 1.8, false);
    }
    tailGlow(player.x, player.z, player.h, player.def.len, player.def.wid, lastThr < 0 && state === 'playing');
    for (const r of rivals) tailGlow(r.x, r.z, r.h, r.def.len, r.def.wid, false);
    for (const c of cops) {
      tailGlow(c.x, c.z, c.h, c.def.len, c.def.wid, false);
      if (flash) gpush(c.x - 0.35, 1.7, c.z, 1, 0.1, 0.1, 5, 0.95); else gpush(c.x + 0.35, 1.7, c.z, 0.2, 0.4, 1, 5, 0.95);
    }
    for (let i = MAXL + gn; i < G_MAX; i++) glow.alp[i] = 0;
    glow.touch();
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
  const fmt = s => { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };
  function updateHUD(dt) {
    hudT += dt; mapT += dt;
    if (hudT >= 0.1) {
      hudT = 0;
      $('spd').textContent = Math.round(player.speed * 3.6);
      $('gear').textContent = String(clamp(1 + Math.floor(player.speed / (player.def.top / 6)), 1, 6));
      $('nosB').style.width = (player.nitro * 100).toFixed(0) + '%';
      $('cash').textContent = '$ ' + save.cash.toLocaleString('pt-BR');
      $('carName').textContent = player.def.name;
      $('drift').textContent = D.pts > 0 ? 'DRIFT  ' + Math.floor(D.pts) + '   ×' + D.mult : '';
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
      $('vig').classList.toggle('pursuit', pursuit.on);
      $('bustB').style.width = (clamp(pursuit.bust, 0, 1) * 100).toFixed(0) + '%';
    }
    if (mapT >= 0.05) { mapT = 0; drawMap(); }
  }

  // linhas de velocidade (overlay 2D de baixa resolução)
  const sfxC = $('sfx'), sg = sfxC.getContext('2d');
  sfxC.width = 320; sfxC.height = 180;
  let sfxOn = false;
  function speedFx() {
    const boosting = player.boost || player.kick > 0;
    const it = quality === 0 ? 0 : clamp((player.speed - player.def.top * 0.65) / (player.def.top * 0.45), 0, 1) * 0.6 + (boosting ? 0.5 : 0);
    if (it < 0.04) { if (sfxOn) { sg.clearRect(0, 0, 320, 180); sfxOn = false; } return; }
    sfxOn = true; sg.clearRect(0, 0, 320, 180); sg.lineWidth = 1.2;
    const n = Math.floor(10 + 24 * it);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.2832, r0 = 60 + rnd() * 60, r1 = r0 + 25 + rnd() * 60 * it;
      sg.strokeStyle = (boosting ? 'rgba(140,200,255,' : 'rgba(210,225,255,') + (0.08 + rnd() * 0.25 * it).toFixed(2) + ')';
      sg.beginPath(); sg.moveTo(160 + Math.cos(a) * r0 * 1.5, 90 + Math.sin(a) * r0 * 0.85); sg.lineTo(160 + Math.cos(a) * r1 * 1.5, 90 + Math.sin(a) * r1 * 0.85); sg.stroke();
    }
  }

  /* ---------------- UI / estados ---------------- */
  function setState(s) {
    prevState = state; state = s;
    ['menu', 'story', 'garage', 'pause', 'result'].forEach(id => $(id).classList.toggle('hide', id !== s));
    $('hud').classList.toggle('hide', !(s === 'playing' || s === 'pause'));
    $('touch').classList.toggle('hide', s !== 'playing');
    if (s !== 'playing') for (const k in touch) { touch[k] = false; }
    if (s !== 'playing' && sfxOn) { sg.clearRect(0, 0, 320, 180); sfxOn = false; }
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
    else if (save.cash >= CARS[gIdx].price) { save.cash -= CARS[gIdx].price; save.owned.push(gIdx); save.cur = gIdx; sfxBank(); }
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
    const live = state !== 'pause' && state !== 'result';
    if (state === 'playing') {
      simulate(sdt);
      fpsT += dt; fpsN++;
      if (fpsT > 2.5) {
        if (fpsN / fpsT < 36 && quality > 0) { quality--; applyQuality(); showMsg('Qualidade reduzida: ' + QN[quality], 1800); }
        fpsT = 0; fpsN = 0;
      }
    } else if (live) updateTraffic(sdt);
    updateAudio(state === 'playing' ? lastThr : 0, sdt);
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
    if (live) { smoke.update(sdt); fxp.update(sdt); }
    glowFrame(flash);
    if (skDirty) { skAttr.needsUpdate = true; skDirty = false; }
    if (state === 'playing') speedFx();
    if (state === 'playing' || state === 'pause') updateHUD(sdt);
    U.uScale.value = canvas.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    sky.position.copy(camera.position);
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
