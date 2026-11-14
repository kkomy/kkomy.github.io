// The book: a procedural hardcover on a white table. Click to pick it up
// and open it; words on facing pages are tied with red thread (a small
// rope simulation) that swings when the book is dragged around.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { buildPages, drawPage, pinOf, CW, CH } from './pages.js';

// ---- dimensions (scene units) ------------------------------------------
const W = 1.32; // page width
const H = 2.0; // page height
const T = 0.11; // thickness of half the page block
const C = 0.024; // cover board thickness
const OV = 0.045; // cover overhang
const S = 2 * T; // spine width
const NU = 40; // segments across a page
const NK = 4; // segments through the page block
const THREAD_RED = 0xc8102e;
const COVER = '#9e4b52'; // muted, dusty dark red

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// How a page rises out of the gutter when the book lies open.
const rise = (u) => 1 - Math.exp(-u / 0.05);

// Cross-section of the page block. u: gutter -> fore-edge, k: cover -> top
// page, e: 0 closed (a flat stack) .. 1 open (fanned from the spine).
// Origin is the back cover's hinge; the open gutter sits at x = -T.
const _s = { x: 0, y: 0 };
function shape(u, k, e) {
  _s.x = lerp(u * W, -k * T + u * (W + k * T), e);
  _s.y = k * T * lerp(1, rise(u), e) + e * k * 0.014 * Math.sin(Math.PI * u);
  return _s;
}
const surfaceY = (u) => T * rise(u) + 0.014 * Math.sin(Math.PI * Math.min(u, 1));

// ---- textures -------------------------------------------------------------
function canvasTexture(canvas, renderer) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function clothCanvas(w, h, base) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // woven cloth: faint crossing threads
  for (let y = 0; y < h; y += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.05})`;
    ctx.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 3) {
    ctx.fillStyle = `rgba(40,0,0,${0.02 + Math.random() * 0.05})`;
    ctx.fillRect(x, 0, 1, h);
  }
  return c;
}

function edgeCanvas() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 256; y++) {
    const v = 226 + Math.floor(Math.random() * 22);
    ctx.fillStyle = `rgb(${v},${v - 5},${v - 17})`;
    ctx.fillRect(0, y, 8, 1);
  }
  return c;
}

function blobCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(20px)';
  ctx.fillStyle = 'rgba(40,36,30,0.5)';
  ctx.fillRect(64, 56, 128, 144);
  return c;
}

// ---- page block geometry --------------------------------------------------
// sign +1: the half resting on the back cover; -1: the half hanging from the
// front cover (same shape, mirrored through the cover's own frame).
function makeBlock(sign) {
  const top = new THREE.BufferGeometry();
  const topPos = new Float32Array((NU + 1) * 2 * 3);
  const topUv = new Float32Array((NU + 1) * 2 * 2);
  const topIdx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    topUv.set([sign > 0 ? u : 1 - u, 1, sign > 0 ? u : 1 - u, 0], i * 4);
    if (i < NU) {
      const a = i * 2;
      topIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  top.setAttribute('position', new THREE.BufferAttribute(topPos, 3));
  top.setAttribute('uv', new THREE.BufferAttribute(topUv, 2));
  top.setIndex(topIdx);

  const edges = new THREE.BufferGeometry();
  const row = NK + 1;
  const count = (NU + 1) * row * 2 + row * 2;
  const ePos = new Float32Array(count * 3);
  const eUv = new Float32Array(count * 2);
  const eIdx = [];
  for (let face = 0; face < 2; face++) {
    const base = face * (NU + 1) * row;
    for (let i = 0; i <= NU; i++) {
      for (let j = 0; j <= NK; j++) {
        eUv.set([(i / NU) * 6, j / NK], (base + i * row + j) * 2);
        if (i < NU && j < NK) {
          const a = base + i * row + j;
          eIdx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
        }
      }
    }
  }
  const foreBase = (NU + 1) * row * 2;
  for (let j = 0; j <= NK; j++) {
    eUv.set([0, j / NK, 9, j / NK], (foreBase + j * 2) * 2);
    if (j < NK) {
      const a = foreBase + j * 2;
      eIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  edges.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  edges.setAttribute('uv', new THREE.BufferAttribute(eUv, 2));
  edges.setIndex(eIdx);

  function update(e) {
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const p = shape(u, 1, e);
      topPos.set([p.x, sign * p.y, -H / 2, p.x, sign * p.y, H / 2], i * 6);
      for (let j = 0; j <= NK; j++) {
        const q = shape(u, j / NK, e);
        ePos.set([q.x, sign * q.y, -H / 2], (i * row + j) * 3);
        ePos.set([q.x, sign * q.y, H / 2], ((NU + 1) * row + i * row + j) * 3);
      }
    }
    for (let j = 0; j <= NK; j++) {
      const q = shape(1, j / NK, e);
      ePos.set([q.x, sign * q.y, -H / 2, q.x, sign * q.y, H / 2], (foreBase + j * 2) * 3);
    }
    top.attributes.position.needsUpdate = true;
    edges.attributes.position.needsUpdate = true;
    top.computeVertexNormals();
    edges.computeVertexNormals();
  }
  return { top, edges, update };
}

// ---- thread ---------------------------------------------------------------
const TN = 26; // particles per thread
const TR = 5; // tube sides
const TRAD = 0.007;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();

class Thread {
  constructor(scene, spec, delay) {
    // spec: which spread, and where each knot sits on its page { u, z }
    this.spread = spec.spread;
    this.a = spec.a;
    this.b = spec.b;
    this.thick = 1;
    this.p = new Float32Array(TN * 3);
    this.q = new Float32Array(TN * 3);
    this.pinA = new THREE.Vector3();
    this.pinB = new THREE.Vector3();
    this.slack = 1.03 + Math.random() * 0.12;
    this.age = -delay;
    this.released = false;
    this.fade = 1;
    this.started = false;
    this.material = new THREE.MeshStandardMaterial({ color: THREAD_RED, roughness: 0.85, transparent: true });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * TR * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(TN * TR * 3), 3));
    const idx = [];
    for (let i = 0; i < TN - 1; i++) {
      for (let j = 0; j < TR; j++) {
        const a = i * TR + j;
        const b = i * TR + ((j + 1) % TR);
        idx.push(a, b, a + TR, b, b + TR, a + TR);
      }
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.scene = scene;
    scene.add(this.mesh);
  }

  start() {
    for (let i = 0; i < TN; i++) {
      const o = i * 3;
      this.p[o] = this.q[o] = this.pinA.x + (Math.random() - 0.5) * 0.004;
      this.p[o + 1] = this.q[o + 1] = this.pinA.y + (Math.random() - 0.5) * 0.004;
      this.p[o + 2] = this.q[o + 2] = this.pinA.z;
    }
    this.started = true;
    this.mesh.visible = true;
  }

  // begin already tied, lying straight between its two knots
  startTied() {
    for (let i = 0; i < TN; i++) {
      _c.lerpVectors(this.pinA, this.pinB, i / (TN - 1));
      this.p.set([_c.x, _c.y, _c.z], i * 3);
      this.q.set([_c.x, _c.y, _c.z], i * 3);
    }
    this.age = 1;
    this.started = true;
    this.mesh.visible = true;
  }

  // one physics substep; collide(p, offset) keeps a particle off the paper
  step(dt, gravity, collide) {
    if (this.age < 0) return;
    if (!this.started) this.start();
    const p = this.p;
    const q = this.q;
    // the free end is drawn out from the first word to the second
    const grow = easeOut(clamp01(this.age / 0.75));
    _c.lerpVectors(this.pinA, this.pinB, grow);
    const rest = (this.pinA.distanceTo(this.pinB) * this.slack) / (TN - 1);
    const g2 = dt * dt;
    for (let i = 0; i < TN; i++) {
      const o = i * 3;
      for (let k = 0; k < 3; k++) {
        const v = (p[o + k] - q[o + k]) * 0.986;
        q[o + k] = p[o + k];
        p[o + k] += v + gravity.getComponent(k) * g2;
      }
    }
    for (let iter = 0; iter < 8; iter++) {
      if (!this.released) {
        p[0] = this.pinA.x; p[1] = this.pinA.y; p[2] = this.pinA.z;
        const e = (TN - 1) * 3;
        p[e] = _c.x; p[e + 1] = _c.y; p[e + 2] = _c.z;
      }
      for (let i = 0; i < TN - 1; i++) {
        const o = i * 3;
        const dx = p[o + 3] - p[o];
        const dy = p[o + 4] - p[o + 1];
        const dz = p[o + 5] - p[o + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d <= rest || d === 0) continue; // a thread only resists stretching
        const pinnedA = !this.released && i === 0;
        const pinnedB = !this.released && i === TN - 2;
        const wa = pinnedA ? 0 : pinnedB ? 1 : 0.5;
        const wb = pinnedB ? 0 : pinnedA ? 1 : 0.5;
        const f = (d - rest) / d;
        p[o] += dx * f * wa; p[o + 1] += dy * f * wa; p[o + 2] += dz * f * wa;
        p[o + 3] -= dx * f * wb; p[o + 4] -= dy * f * wb; p[o + 5] -= dz * f * wb;
      }
    }
    if (!this.released) for (let i = 1; i < TN - 1; i++) collide(p, q, i * 3);
  }

  draw(toCamera) {
    if (!this.started) return;
    const pos = this.mesh.geometry.attributes.position.array;
    const nor = this.mesh.geometry.attributes.normal.array;
    const p = this.p;
    const rad = TRAD * this.thick;
    for (let i = 0; i < TN; i++) {
      const o = i * 3;
      const n = Math.min(TN - 1, i + 1) * 3;
      const m = Math.max(0, i - 1) * 3;
      _t.set(p[n] - p[m], p[n + 1] - p[m + 1], p[n + 2] - p[m + 2]);
      if (_t.lengthSq() < 1e-12) _t.set(1, 0, 0);
      _t.normalize();
      _a.crossVectors(_t, toCamera);
      if (_a.lengthSq() < 1e-8) _a.set(0, 1, 0);
      _a.normalize();
      _b.crossVectors(_t, _a);
      for (let j = 0; j < TR; j++) {
        const ang = (j / TR) * Math.PI * 2;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        const nx = _a.x * cs + _b.x * sn;
        const ny = _a.y * cs + _b.y * sn;
        const nz = _a.z * cs + _b.z * sn;
        const k = (i * TR + j) * 3;
        pos[k] = p[o] + nx * rad;
        pos[k + 1] = p[o + 1] + ny * rad;
        pos[k + 2] = p[o + 2] + nz * rad;
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
    this.material.opacity = this.fade;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// ---- the scene --------------------------------------------------------------
export async function createBook(canvas, { onChange = () => {} } = {}) {
  const source = await fetch('./book/text.txt').then((r) => r.text());
  if (document.fonts) {
    const fonts = ['33px "EB Garamond"', 'italic 33px "EB Garamond"', '500 92px "EB Garamond"'];
    await Promise.race([
      Promise.all(fonts.map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500)),
    ]).catch(() => {});
  }
  const { pages, spreads } = buildPages(source);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xffffff, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xf6f3ee, 1.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(-3.2, 9, 4.6);
  sun.target.position.set(0, 1.2, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -4.5;
  sun.shadow.camera.right = 4.5;
  sun.shadow.camera.top = 4.5;
  sun.shadow.camera.bottom = -4.5;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 24;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.004;
  scene.add(sun, sun.target);

  // no depth write: on narrow screens the open book dips below the table plane
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.16, depthWrite: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const blobMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(blobCanvas()),
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
  });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.1), blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  scene.add(blob);

  // --- materials
  const clothTex = canvasTexture(clothCanvas(256, 256, COVER), renderer);
  clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping;
  clothTex.repeat.set(3, 4);
  const cloth = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.82 });
  const endpaper = new THREE.MeshStandardMaterial({ color: 0xebe5d6, roughness: 1 });
  const edgeTex = canvasTexture(edgeCanvas(), renderer);
  edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 1, side: THREE.DoubleSide });
  const pageMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });

  // --- hierarchy: root (pose) > inner (centering) > covers, spine, blocks
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  scene.add(root);

  const coverGeo = new THREE.BoxGeometry(W + OV, C, H + 2 * OV);
  const back = new THREE.Mesh(coverGeo, [cloth, cloth, endpaper, cloth, cloth, cloth]);
  back.position.set((W + OV) / 2, -C / 2, 0);
  inner.add(back);

  const spineGroup = new THREE.Group();
  const spine = new THREE.Mesh(new THREE.BoxGeometry(1, C, H + 2 * OV), cloth);
  spine.position.set(S / 2, C / 2, 0);
  spineGroup.add(spine);
  inner.add(spineGroup);

  const frontGroup = new THREE.Group();
  const front = new THREE.Mesh(coverGeo, [cloth, cloth, cloth, endpaper, cloth, cloth]);
  front.position.set((W + OV) / 2, C / 2, 0);
  frontGroup.add(front);
  inner.add(frontGroup);

  const right = makeBlock(1);
  const left = makeBlock(-1);
  const rightMat = pageMat();
  const leftMat = pageMat();
  const rightTop = new THREE.Mesh(right.top, rightMat);
  const leftTop = new THREE.Mesh(left.top, leftMat);
  inner.add(rightTop, new THREE.Mesh(right.edges, edgeMat));
  frontGroup.add(leftTop, new THREE.Mesh(left.edges, edgeMat));

  // the turning leaf: one sheet, a different page on each face
  const leafGeoA = new THREE.BufferGeometry();
  const leafPos = new THREE.BufferAttribute(new Float32Array((NU + 1) * 2 * 3), 3);
  const uvA = new Float32Array((NU + 1) * 4);
  const uvB = new Float32Array((NU + 1) * 4);
  const leafIdx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    uvA.set([u, 1, u, 0], i * 4);
    uvB.set([1 - u, 1, 1 - u, 0], i * 4);
    if (i < NU) leafIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  leafGeoA.setAttribute('position', leafPos);
  leafGeoA.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  leafGeoA.setIndex(leafIdx);
  const leafGeoB = new THREE.BufferGeometry();
  leafGeoB.setAttribute('position', leafPos);
  leafGeoB.setAttribute('uv', new THREE.BufferAttribute(uvB, 2));
  leafGeoB.setIndex(leafIdx);
  const leafFrontMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.FrontSide });
  const leafBackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.BackSide });
  const leafA = new THREE.Mesh(leafGeoA, leafFrontMat);
  const leafB = new THREE.Mesh(leafGeoB, leafBackMat);
  const leaf = new THREE.Group();
  leaf.add(leafA, leafB);
  leaf.visible = false;
  inner.add(leaf);

  inner.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  // the printed surfaces are single sheets: they only receive shadow
  for (const m of [rightTop, leftTop, leafA, leafB]) m.castShadow = false;

  // The turning leaf in cross-section. t: 0 lying on the right page .. 1 on
  // the left page; u: gutter -> fore-edge.
  const _l = { x: 0, y: 0 };
  function leafXY(u, t) {
    const rx = u * (W + T);
    const ry = surfaceY(u) + 0.004;
    const r = Math.hypot(rx, ry);
    const a0 = Math.atan2(ry, rx);
    const q = clamp01(ease(t) + 0.2 * Math.sin(Math.PI * t) * (Math.pow(u, 1.4) - 0.45));
    const ang = a0 + (Math.PI - 2 * a0) * q;
    _l.x = -T + Math.cos(ang) * r;
    _l.y = Math.sin(ang) * r;
    return _l;
  }
  function setLeaf(t) {
    const arr = leafPos.array;
    for (let i = 0; i <= NU; i++) {
      const { x, y } = leafXY(i / NU, t);
      arr.set([x, y, -H / 2, x, y, H / 2], i * 6);
    }
    leafPos.needsUpdate = true;
    leafGeoA.computeVertexNormals();
    leafGeoB.setAttribute('normal', leafGeoA.attributes.normal);
  }
  // a point just off the leaf: face +1 is the side that is up on the right
  function onLeaf(u, z, t, face, out) {
    const a = leafXY(Math.max(0, u - 0.01), t);
    const ax = a.x;
    const ay = a.y;
    const b = leafXY(Math.min(1, u + 0.01), t);
    const tx = b.x - ax;
    const ty = b.y - ay;
    const n = Math.hypot(tx, ty) || 1;
    const c = leafXY(u, t);
    return out.set(c.x - (ty / n) * 0.009 * face, c.y + (tx / n) * 0.009 * face, z);
  }

  // --- page textures (small cache)
  const texCache = new Map();
  function pageTexture(index) {
    if (texCache.has(index)) return texCache.get(index);
    const tex = canvasTexture(drawPage(pages[index]), renderer);
    texCache.set(index, tex);
    return tex;
  }
  function setMap(material, index) {
    material.map = pageTexture(index);
    material.needsUpdate = true;
  }

  // --- poses
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camBack = new THREE.Vector3();
  const closedPos = new THREE.Vector3(0.12, 0, 0.12);
  const closedQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, 0));
  const openPos = new THREE.Vector3();
  const openQuat = new THREE.Quaternion();
  let unitsPerPixel = 0.005;

  const home = new THREE.Object3D(); // the default viewpoint; poses are built from it
  const homePos = new THREE.Vector3();
  const homeTarget = new THREE.Vector3(0, 0, 0.12);
  const openCenter = new THREE.Vector3();
  let free = false; // the reader has moved the camera
  let resetting = false;

  function layout() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const far = Math.max(1, 0.82 / camera.aspect); // step back on narrow screens
    homePos.set(0, 6.5 * far, 5.3 * far);
    home.position.copy(homePos);
    home.up.set(0, 1, 0);
    // Object3D.lookAt points +z at the target; a camera looks down -z
    home.lookAt(homePos.clone().multiplyScalar(2).sub(homeTarget));
    home.updateMatrixWorld();
    home.matrixWorld.extractBasis(camRight, camUp, camBack);
    if (!free) camera.position.copy(homePos);

    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
    const spreadW = 2 * (W + T + OV) + 0.1;
    const spreadH = H + 2 * OV;
    const d = Math.max(spreadW / (0.9 * tan * camera.aspect), spreadH / (0.68 * tan));
    openCenter.copy(homePos).addScaledVector(camBack, -d);
    openPos.copy(openCenter).addScaledVector(camUp, -0.012 * d);
    unitsPerPixel = (tan * d) / h;
    // face the reader, leaning back a touch
    const m = new THREE.Matrix4().makeBasis(camRight, camBack, camUp.clone().negate());
    openQuat.setFromRotationMatrix(m);
    openQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.1));
  }

  // --- state
  let state = 'closed'; // closed | opening | open | flipping | closing
  let o = 0; // 0 closed .. 1 open
  let spread = 0;
  let hover = 0;
  let hovering = false;
  let flip = null; // { t, dir, to }
  let threads = [];
  const dying = [];
  const shake = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), target: new THREE.Vector3() };
  let active = true;
  let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const emit = () => onChange({ state, spread, spreads: spreads.length, free });

  function applyOpenness() {
    const a = ease(clamp01((o - 0.12) / 0.88));
    const alpha = (Math.PI / 2) * (1 + a);
    const beta = Math.PI * ease(o);
    const e = ease(clamp01((o - 0.3) / 0.7));
    spineGroup.rotation.z = alpha;
    const ext = C * (1 - a);
    spine.scale.x = S + 2 * ext;
    frontGroup.position.set(S * Math.cos(alpha), S * Math.sin(alpha), 0);
    frontGroup.rotation.z = beta;
    right.update(e);
    left.update(e);
    inner.position.set(lerp(-W / 2, T, ease(o)), C, 0);
  }

  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  function applyPose() {
    const p = ease(o);
    root.position.lerpVectors(closedPos, openPos, p);
    root.position.y += Math.sin(Math.PI * p) * 0.5 + hover * 0.07 * (1 - p);
    root.quaternion.slerpQuaternions(closedQuat, openQuat, p);
    if (p > 0) {
      root.position.addScaledVector(liveRight, shake.pos.x * p).addScaledVector(liveUp, shake.pos.y * p);
      _e.set(shake.pos.y * 0.22 - shake.vel.y * 0.012, shake.vel.x * 0.02, -shake.pos.x * 0.2 - shake.vel.x * 0.03);
      root.quaternion.multiply(_q.setFromEuler(_e));
    }
    blob.position.x = root.position.x;
    blob.position.z = root.position.z + 0.05;
    blob.rotation.z = 0.3 * (1 - p);
    const lift = 1 + p * 0.9 + hover * 0.04;
    blob.scale.set(lift, lift, 1);
    blobMat.opacity = lerp(0.42, 0.0, p) - hover * 0.06 * (1 - p);
    groundMat.opacity = lerp(0.16, 0, clamp01(p * 1.4));
    root.updateMatrixWorld(true);
  }

  // --- threads
  const _local = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  function knot(page, word) {
    const pin = pinOf(page, word);
    return { u: page.side === 'L' ? 1 - pin.x / CW : pin.x / CW, z: (pin.y / CH - 0.5) * H };
  }
  function onPage(side, k, out) {
    const s = shape(k.u, 1, 1);
    return out.set(side === 'L' ? -2 * T - s.x : s.x, s.y + 0.009, k.z);
  }
  // Where a thread's knots are right now, in the book's frame. A thread is
  // tied to two facing pages; while the leaf between two spreads is turning,
  // one of those pages is a face of that leaf and the knot rides on it.
  function placeKnots(t) {
    t.thick = 1;
    if (flip) {
      const lo = Math.min(flip.to, flip.to - flip.dir);
      const lt = flip.dir > 0 ? flip.t : 1 - flip.t;
      const gap = ease(lt); // 0: leaf on the right .. 1: leaf on the left
      if (t.spread === lo) {
        // left page | front of the leaf: closes as the leaf comes over
        onPage('L', t.a, t.pinA);
        onLeaf(t.b.u, t.b.z, lt, 1, t.pinB);
        t.thick = THREE.MathUtils.smoothstep(1 - gap, 0, 0.12);
        return;
      }
      if (t.spread === lo + 1) {
        // back of the leaf | right page: opens as the leaf lifts away
        onLeaf(t.a.u, t.a.z, lt, -1, t.pinA);
        onPage('R', t.b, t.pinB);
        t.thick = THREE.MathUtils.smoothstep(gap, 0, 0.12);
        return;
      }
    }
    onPage('L', t.a, t.pinA);
    onPage('R', t.b, t.pinB);
  }
  function collide(p, q, i) {
    _local.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(inverse);
    const u = Math.abs(_local.x + T) / (W + T);
    if (u > 1.01 || Math.abs(_local.z) > H / 2 + 0.03) return;
    const ys = surfaceY(u) + TRAD + 0.002;
    if (_local.y >= ys || _local.y < ys - 0.3) return;
    _local.y = ys;
    _local.applyMatrix4(inner.matrixWorld);
    p[i] = _local.x; p[i + 1] = _local.y; p[i + 2] = _local.z;
    // a little friction against the paper
    q[i] = lerp(q[i], p[i], 0.25);
    q[i + 1] = lerp(q[i + 1], p[i + 1], 0.25);
    q[i + 2] = lerp(q[i + 2], p[i + 2], 0.25);
  }
  // tied: the thread already exists between the pages (used when a page
  // turn reveals a spread); otherwise it is drawn out word to word
  function spawn(index, tied) {
    const s = spreads[index];
    s.links.forEach((link, i) => {
      const spec = { spread: index, a: knot(s.left, link.a), b: knot(s.right, link.b) };
      const t = new Thread(scene, spec, tied || reduced ? 0 : 0.12 + i * 0.13);
      if (tied) {
        placeKnots(t);
        inner.localToWorld(t.pinA);
        inner.localToWorld(t.pinB);
        t.startTied();
      }
      threads.push(t);
    });
  }
  function tie() {
    if (!threads.some((t) => t.spread === spread)) spawn(spread, false);
  }
  function untie() {
    for (const t of threads.splice(0)) {
      t.released = true;
      if (!t.started) t.dispose();
      else dying.push(t);
    }
  }
  // threads shut between two pages are out of sight: let them go
  function shut() {
    for (let i = threads.length - 1; i >= 0; i--) {
      if (threads[i].spread !== spread) threads.splice(i, 1)[0].dispose();
    }
  }

  const gravity = new THREE.Vector3();
  let time = 0;
  function simulate(dt) {
    inverse.copy(inner.matrixWorld).invert();
    // gravity hangs the threads down the page and presses them lightly on it
    const sway = Math.sin(time * 0.7) * 0.25;
    gravity.copy(camUp).multiplyScalar(-5.2).addScaledVector(camBack, -1.6).addScaledVector(camRight, sway);
    const steps = Math.max(1, Math.min(4, Math.round(dt / (1 / 120))));
    const h = dt / steps;
    for (const t of threads) {
      placeKnots(t);
      inner.localToWorld(t.pinA);
      inner.localToWorld(t.pinB);
      t.age += dt;
    }
    for (const t of dying) t.fade -= dt / 0.55;
    for (let s = 0; s < steps; s++) {
      for (const t of threads) t.step(h, gravity, collide);
      for (const t of dying) t.step(h, gravity, collide);
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      if (dying[i].fade <= 0) dying.splice(i, 1)[0].dispose();
    }
    for (const t of threads) t.draw(liveBack);
    for (const t of dying) t.draw(liveBack);
  }

  // --- actions
  function showSpread() {
    setMap(leftMat, spreads[spread].left.index);
    setMap(rightMat, spreads[spread].right.index);
  }
  function open() {
    if (state !== 'closed') return;
    showSpread();
    state = 'opening';
    canvas.style.cursor = '';
    emit();
  }
  function close() {
    if (state !== 'open') return;
    untie();
    shake.target.set(0, 0, 0);
    state = 'closing';
    emit();
  }
  function turn(dir) {
    if (state !== 'open') return;
    const to = spread + dir;
    if (to < 0 || to >= spreads.length) return;
    const from = spreads[spread];
    const next = spreads[to];
    if (dir > 0) {
      leafFrontMat.map = pageTexture(from.right.index);
      leafBackMat.map = pageTexture(next.left.index);
      setMap(rightMat, next.right.index);
    } else {
      leafFrontMat.map = pageTexture(next.right.index);
      leafBackMat.map = pageTexture(from.left.index);
      setMap(leftMat, next.left.index);
    }
    leafFrontMat.needsUpdate = leafBackMat.needsUpdate = true;
    flip = { t: 0, dir, to };
    setLeaf(dir > 0 ? 0 : 1);
    root.updateMatrixWorld(true);
    spawn(to, true);
    leaf.visible = true;
    state = 'flipping';
    spread = to;
    emit();
  }

  // --- pointer
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hit(event, objects) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(objects, true)[0];
  }
  let down = null;
  canvas.addEventListener('pointerdown', (ev) => {
    // open book: a drag that starts on the book shakes it; anywhere else
    // (and always while it is closed) the drag belongs to the camera
    const grab = (state === 'open' || state === 'flipping') && !!hit(ev, [inner]);
    down = { x: ev.clientX, y: ev.clientY, moved: false, grab };
    if (grab) {
      controls.enabled = false;
      canvas.setPointerCapture(ev.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!down) {
      hovering = state === 'closed' && !!hit(ev, [inner]);
      canvas.style.cursor = hovering ? 'pointer' : '';
      return;
    }
    const dx = ev.clientX - down.x;
    const dy = ev.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 6) {
      down.moved = true;
      hovering = false;
      canvas.style.cursor = 'grabbing';
    }
    if (down.moved && down.grab) {
      shake.target.set(dx * unitsPerPixel, -dy * unitsPerPixel, 0).clampLength(0, 0.85);
    }
  });
  const release = (ev) => {
    if (!down) return;
    const { moved, grab } = down;
    down = null;
    controls.enabled = true;
    shake.target.set(0, 0, 0);
    canvas.style.cursor = '';
    if (moved || ev.type === 'pointercancel') return;
    if (state === 'closed') {
      if (hit(ev, [inner])) open();
    } else if (state === 'open' && grab) {
      const h = hit(ev, [leftTop, rightTop]);
      if (h) turn(h.object === rightTop ? 1 : -1);
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    hovering = false;
  });

  // --- free camera: drag to orbit, wheel / pinch to zoom
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.rotateSpeed = 0.7;
  controls.minDistance = 2.2;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI * 0.495; // stay above the table
  controls.addEventListener('start', () => {
    resetting = false;
    if (!free) {
      free = true;
      emit();
    }
  });
  const liveRight = new THREE.Vector3();
  const liveUp = new THREE.Vector3();
  const liveBack = new THREE.Vector3();
  function updateCamera(dt) {
    // always orbit around the book, wherever it is
    controls.target.lerpVectors(homeTarget, openCenter, ease(o));
    if (resetting) {
      camera.position.lerp(homePos, 1 - Math.exp(-dt * 7));
      if (camera.position.distanceTo(homePos) < 0.01) {
        resetting = false;
        free = false;
        emit();
      }
    }
    if (!free) camera.position.copy(homePos);
    controls.update();
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(liveRight, liveUp, liveBack);
  }
  function resetView() {
    if (free) resetting = true;
  }

  // --- loop
  let last = performance.now();
  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
  }
  function update(dt) {
    time += dt;

    hover += ((hovering && state === 'closed' ? 1 : 0) - hover) * Math.min(1, dt * 10);
    updateCamera(dt);

    if (state === 'opening' || state === 'closing') {
      const speed = reduced ? 4 : 1 / 1.5;
      o = clamp01(o + (state === 'opening' ? dt : -dt) * speed);
      applyOpenness();
      if (state === 'opening' && o === 1) {
        state = 'open';
        tie();
        emit();
      } else if (state === 'closing' && o === 0) {
        state = 'closed';
        shake.pos.set(0, 0, 0);
        shake.vel.set(0, 0, 0);
        emit();
      }
    }

    if (flip) {
      flip.t = clamp01(flip.t + dt / (reduced ? 0.2 : 1.1));
      setLeaf(flip.dir > 0 ? flip.t : 1 - flip.t);
      if (flip.t === 1) {
        leaf.visible = false;
        flip = null;
        showSpread();
        state = 'open';
        shut();
        emit();
      }
    }

    // the book follows the hand on a soft spring, so it overshoots and wobbles
    const k = 130;
    const c = 8.5;
    shake.vel.x += (-k * (shake.pos.x - shake.target.x) - c * shake.vel.x) * dt;
    shake.vel.y += (-k * (shake.pos.y - shake.target.y) - c * shake.vel.y) * dt;
    shake.pos.addScaledVector(shake.vel, dt);

    applyPose();
    if (threads.length || dying.length) simulate(dt);
    renderer.render(scene, camera);
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    cancelAnimationFrame(raf);
    if (on) {
      layout();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });

  layout();
  applyOpenness();
  showSpread();
  raf = requestAnimationFrame(frame);
  emit();

  return {
    open,
    close,
    next: () => turn(1),
    // run the animation forward without waiting for frames (for testing)
    advance: (seconds) => { for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60); },
    shake: (x, y) => shake.target.set(x, y, 0),
    prev: () => turn(-1),
    setActive,
    resetView,
    get state() { return state; },
  };
}
