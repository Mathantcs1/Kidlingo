// Cell-block set: flat-shaded lit primitives (cheap on software GL). Units are metres; floor at y=0, figures stand at z≈0.
export function buildCellblock(THREE) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9bf9d);
  scene.fog = new THREE.Fog(0xb9b090, 10, 26);

  const tile = (w, h, base, line) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 3;
    for (let y = 0; y < h; y += h / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let r = 0; r < 8; r++) for (let x = (r % 2) * (w / 8); x < w; x += w / 4) { g.beginPath(); g.moveTo(x, r * h / 8); g.lineTo(x, (r + 1) * h / 8); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0, ...extra });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; };

  const brick = tile(512, 512, '#d8cca6', '#a89d78'); brick.repeat.set(5, 2);
  box(14, 0.2, 40, mat(0x4d5a63), 0, -0.1, -8);                 // floor
  box(14, 5, 0.3, mat(0xffffff, { map: brick }), 0, 2.5, -4.5);  // back wall
  box(0.3, 5, 40, mat(0xffffff, { map: brick }), -5.5, 2.5, -8); // left wall
  box(0.3, 5, 40, mat(0xffffff, { map: brick }), 5.5, 2.5, -8);  // right wall
  box(14, 0.3, 40, mat(0x8a8470), 0, 5, -8);                     // ceiling

  const teal = mat(0x2fb3a3, { roughness: 0.5 });
  for (let i = -5; i <= 5; i++) {                                // cell bars, front-left
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 8), teal);
    bar.position.set(-2.4 + i * 0.3, 2.3, -1.4); scene.add(bar);
  }
  for (const y of [4.5, 0.1, 2.3]) box(3.4, 0.12, 0.12, teal, -2.4, y, -1.4);

  const blue = mat(0x2d4fa8), steel = mat(0x888f99, { metalness: 0.3, roughness: 0.4 });
  box(2.0, 0.12, 0.9, blue, 2.6, 0.5, -3.5);
  box(14, 0.9, 0.32, mat(0x3a4a52), 0, 0.45, -4.4);             // dark wainscot band for depth                     // lower bunk
  box(2.0, 0.12, 0.9, blue, 2.6, 1.7, -3.5);                     // upper bunk
  for (const [x, z] of [[1.7, -3.1], [3.5, -3.1], [1.7, -3.9], [3.5, -3.9]]) box(0.08, 1.8, 0.08, steel, x, 0.9, z);
  box(0.9, 0.9, 0.1, mat(0xc7e4ea, { emissive: 0x6aa3b0, emissiveIntensity: 0.4 }), -1.2, 3.2, -4.3);  // barred window glow
  scene.add(new THREE.HemisphereLight(0xfff2d0, 0x403a30, 1.4));
  const key = new THREE.DirectionalLight(0xffe7b0, 1.8); key.position.set(3, 6, 6); scene.add(key);
  const lamp = new THREE.PointLight(0xffd9a0, 10, 14, 1.4); lamp.position.set(0, 4.4, 0); scene.add(lamp);
  return { scene };
}
