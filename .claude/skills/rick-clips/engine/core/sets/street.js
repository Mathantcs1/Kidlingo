// Sleepy town street at night: dark road, rows of buildings with a few lit windows, lamp posts. Units: metres, figures at z≈0.
export function buildStreet(THREE) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14203d);
  scene.fog = new THREE.Fog(0x14203d, 8, 34);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; };
  box(40, 0.2, 60, mat(0x2a2f3c), 0, -0.1, -10);                    // road
  box(40, 0.3, 4, mat(0x4a5060), 0, 0.05, -5.6);                    // far pavement
  const tints = [0x6b4a63, 0x4b5f86, 0x7a5a48, 0x3f6a6a, 0x6a4b4b, 0x56527a];
  for (let i = 0; i < 9; i++) {                                    // facing row
    const x = -13 + i * 3.4, h = 5 + ((i * 7) % 5) * 1.3, b = box(3.2, h, 3, mat(tints[i % tints.length]), x, h / 2, -8);
    for (let r = 0; r < Math.floor(h / 1.6); r++) for (const dx of [-0.8, 0.8]) {
      const lit = (i * 3 + r + (dx > 0 ? 1 : 0)) % 5 === 0;       // a few windows lit
      box(0.7, 0.9, 0.06, mat(lit ? 0xffe0a0 : 0x1a2338, lit ? { emissive: 0xffd080, emissiveIntensity: 1.2 } : {}), x + dx, 1.5 + r * 1.6, -6.46);
    }
    void b;
  }
  for (const sx of [-6.5, 6.5]) for (let k = 0; k < 4; k++)       // side buildings give depth
    box(3, 6 + k, 3, mat(tints[(k + (sx > 0 ? 2 : 0)) % tints.length]), sx, (6 + k) / 2, -2 - k * 3.5);
  for (const x of [-4, 3.5]) {                                     // lamp posts
    box(0.12, 3.4, 0.12, mat(0x222831), x, 1.7, -3.6);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat(0xffe9b0, { emissive: 0xffd890, emissiveIntensity: 2 })); lamp.position.set(x, 3.5, -3.6); scene.add(lamp);
    const l = new THREE.PointLight(0xffd890, 14, 11, 1.4); l.position.set(x, 3.4, -3.2); scene.add(l);
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), mat(0xf4f1dc, { emissive: 0xdedbc0, emissiveIntensity: 1.2 })); moon.position.set(-5, 9, -16); scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x8fa3d8, 0x20263a, 1.3));
  const key = new THREE.DirectionalLight(0xb8c8ff, 1.0); key.position.set(-3, 6, 6); scene.add(key);
  return { scene };
}
