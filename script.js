
const container = document.getElementById('container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

// ---- Pixel art look ----
// The trick: render at a much lower internal resolution, then let the
// browser scale the canvas up to fill the screen using nearest-neighbor
// (no smoothing) instead of the usual smooth interpolation. Lower
// PIXEL_SCALE = chunkier pixels.
const PIXEL_SCALE = 6;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setPixelRatio(1); // keep resolution low even on retina screens
container.appendChild(renderer.domElement);

const canvasEl = renderer.domElement;
canvasEl.style.width = '100%';
canvasEl.style.height = '100%';
canvasEl.style.imageRendering = 'pixelated'; // Chrome/Edge/Firefox
canvasEl.style.imageRendering = '-moz-crisp-edges'; // older Firefox fallback

function setPixelResolution() {
  const width = Math.floor(window.innerWidth / PIXEL_SCALE);
  const height = Math.floor(window.innerHeight / PIXEL_SCALE);
  // false = don't let three.js touch the canvas's CSS size, only its
  // internal drawing buffer -- the CSS above handles the upscaling.
  renderer.setSize(width, height, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
setPixelResolution();

// Lighting -- one warm key light, one cool fill from behind
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xd97757, 0.4);
fillLight.position.set(-3, -2, -4);
scene.add(fillLight);

// Everything below is added to this group, so drag/roll rotates it all together.
const dieGroup = new THREE.Group();
scene.add(dieGroup);

const RADIUS = 1.3;
// detail:0 gives exactly 20 triangular faces -- a perfect base shape for a d20.
const geometry = new THREE.IcosahedronGeometry(RADIUS, 0).toNonIndexed();

// Which faces (0-indexed, so face 2 = number 3) currently have an open
// quest. In the real game this would come from Supabase -- e.g. which
// challenges exist for the exhibit the player is at. Hardcoded here
// just for the demo.
const availableFaces = new Set([2, 5, 9, 14, 18]);

// Two materials: a dim "locked" look, and a lit-up glowing "available
// quest" look. Each triangle gets tagged with a material group below
// depending on whether it's in availableFaces.
const lockedMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a382f, roughness: 0.6, metalness: 0.1, flatShading: true
});
const availableMaterial = new THREE.MeshStandardMaterial({
  color: 0xd97757, emissive: 0xd97757, emissiveIntensity: 0.5,
  roughness: 0.35, metalness: 0.2, flatShading: true
});

geometry.clearGroups();
for (let face = 0; face < 20; face++) {
  const materialIndex = availableFaces.has(face) ? 1 : 0;
  geometry.addGroup(face * 3, 3, materialIndex);
}

const dieMesh = new THREE.Mesh(geometry, [lockedMaterial, availableMaterial]);
dieGroup.add(dieMesh);

// Dark edge outlines for that faceted, physical-die look
const edgeLines = new THREE.LineSegments(
  new THREE.EdgesGeometry(geometry, 1),
  new THREE.LineBasicMaterial({ color: 0x1c1b19 })
);
dieGroup.add(edgeLines);

// ---- Build a number label for each of the 20 faces ----
function makeNumberTexture(number) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#f4f1ea';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), size / 2, size / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const positions = geometry.attributes.position;
const faceNormals = []; // kept so the "roll" result can be read off later

for (let face = 0; face < 20; face++) {
  const i0 = face * 3;
  const v0 = new THREE.Vector3().fromBufferAttribute(positions, i0);
  const v1 = new THREE.Vector3().fromBufferAttribute(positions, i0 + 1);
  const v2 = new THREE.Vector3().fromBufferAttribute(positions, i0 + 2);

  const centroid = v0.clone().add(v1).add(v2).divideScalar(3);
  // For a regular icosahedron centered at the origin, the vector from
  // the center to a face's centroid points straight out along that
  // face's normal -- so we get the outward direction for free here.
  const normal = centroid.clone().normalize();
  faceNormals.push(normal);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshBasicMaterial({ map: makeNumberTexture(face + 1), transparent: true })
  );
  label.position.copy(centroid).addScaledVector(normal, 0.02);
  label.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  dieGroup.add(label);
}

// ---- Drag to rotate (and track movement so we can tell a drag from a tap) ----
let isDragging = false;
let previousPointer = { x: 0, y: 0 };
let pointerDownAt = { x: 0, y: 0 };
let totalDragDistance = 0;
let velocity = { x: 0.003, y: 0.004 }; // gentle idle spin when nothing's happening

container.addEventListener('pointerdown', (e) => {
  isDragging = true;
  totalDragDistance = 0;
  previousPointer = { x: e.clientX, y: e.clientY };
  pointerDownAt = { x: e.clientX, y: e.clientY };
  container.setPointerCapture(e.pointerId);
});

container.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const deltaX = e.clientX - previousPointer.x;
  const deltaY = e.clientY - previousPointer.y;
  dieGroup.rotation.y += deltaX * 0.008;
  dieGroup.rotation.x += deltaY * 0.008;
  velocity = { x: deltaY * 0.0006, y: deltaX * 0.0006 };
  totalDragDistance += Math.abs(deltaX) + Math.abs(deltaY);
  previousPointer = { x: e.clientX, y: e.clientY };
});

container.addEventListener('pointerup', (e) => {
  isDragging = false;
  // Barely moved -- treat this as a tap/click rather than a drag,
  // and check whether it landed on a face.
  if (totalDragDistance < 6) {
    handleFaceClick(e.clientX, e.clientY);
  }
});

container.addEventListener('pointerleave', () => { isDragging = false; });

// ---- Click/tap detection on individual faces ----
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const toast = document.getElementById('toast');
let toastTimeout;

function showToast(message) {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.style.opacity = '1';
  toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
}

function handleFaceClick(clientX, clientY) {
  const rect = container.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObject(dieMesh);
  if (hits.length === 0) return;

  const faceIndex = hits[0].faceIndex;
  if (availableFaces.has(faceIndex)) {
    openQuestPanel(faceIndex);
  } else {
    showToast('No quest here yet');
  }
}

// ---- The quest panel that opens on a lit face ----
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');

function openQuestPanel(faceIndex) {
  // Placeholder content -- in the real game this is where you'd fetch
  // the actual challenge for this face/quest slot from Supabase and
  // show its question here instead.
  panelTitle.textContent = 'challenge ' + (faceIndex + 1);
  panelBody.textContent = 'This is where the challenge question for this quest would appear.';
  panel.style.display = 'block';
}

document.getElementById('panel-close').addEventListener('click', () => {
  panel.style.display = 'none';
});

// ---- Render loop ----
function animate() {
  requestAnimationFrame(animate);
  if (!isDragging) {
    dieGroup.rotation.y += velocity.y;
    dieGroup.rotation.x += velocity.x;
    velocity.x *= 0.985;
    velocity.y *= 0.985;
  }
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', setPixelResolution);
