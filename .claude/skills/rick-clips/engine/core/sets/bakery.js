// Bakery at 3 am: warm brown walls, dark checker floor, glowing oven, shelves of loaves. Units: metres, figures at z≈0.
export function buildBakery(THREE) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b1d18);
  scene.fog = new THREE.Fog(0x2b1d18, 9, 22);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; };

  const checker = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#3a2f2c' : '#26201e'; g.fillRect(x * 64, y * 64, 64, 64); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 12); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  box(14, 0.2, 30, mat(0xffffff, { map: checker }), 0, -0.1, -8);   // floor
  box(14, 5, 0.3, mat(0x7a4f3a), 0, 2.5, -4.5);                    // back wall
  box(0.3, 5, 30, mat(0x6a4432), -5.5, 2.5, -8); box(0.3, 5, 30, mat(0x6a4432), 5.5, 2.5, -8);
  box(14, 0.3, 30, mat(0x3a2a22), 0, 5, -8);                       // ceiling
  box(14, 1.0, 0.34, mat(0xe9dcc0), 0, 0.5, -4.4);                 // tiled lower wall band

  box(5.5, 1.0, 1.0, mat(0xb8845a), 0.8, 0.5, -2.6);               // counter
  box(5.7, 0.1, 1.2, mat(0xe2c9a0), 0.8, 1.05, -2.6);              // counter top
  const oven = box(2.4, 2.6, 1.4, mat(0x4a4a52, { metalness: 0.3, roughness: 0.5 }), -3.3, 1.3, -3.6);
  box(1.4, 0.9, 0.1, mat(0xff7a1a, { emissive: 0xff5a00, emissiveIntensity: 1.6 }), -3.3, 1.0, -2.88);   // glowing oven door
  const glow = new THREE.PointLight(0xff8a30, 18, 12, 1.5); glow.position.set(-3.3, 1.2, -2.2); scene.add(glow);
  for (let r = 0; r < 3; r++) {                                    // shelves with loaves (flattened spheres)
    box(2.6, 0.08, 0.6, mat(0x5a3a2a), 3.4, 1.2 + r * 0.9, -4.1);
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mat(0xc98a3c)); l.scale.set(1.5, 0.8, 0.9); l.position.set(2.5 + i * 0.45, 1.4 + r * 0.9, -4.1); scene.add(l); }
  }
  for (const x of [-1.5, 1.2, 3.2]) { const l = new THREE.PointLight(0xffd9a0, 6, 9, 1.6); l.position.set(x, 4.2, -1); scene.add(l);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(0xfff0c0, { emissive: 0xffe0a0, emissiveIntensity: 1.5 })); s.position.set(x, 4.2, -1); scene.add(s); }
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x30221c, 1.0));
  return { scene };
}
