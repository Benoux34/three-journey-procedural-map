import * as THREE from "three";
import GUI from "lil-gui";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { ImprovedNoise } from "three/addons/math/ImprovedNoise.js";
import { SUBTRACTION, Evaluator, Brush } from "three-bvh-csg";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import terrainVertexShader from "./shaders/terrain/vertex.glsl";
import terrainFragmentShader from "./shaders/terrain/fragment.glsl";
import cloudVertexShader from "./shaders/clouds/vertex.glsl";
import cloudFragmentShader from "./shaders/clouds/fragment.glsl";

/**
 * Base
 */
// Debug
const gui = new GUI({ width: 325 });
const debugObject = {};

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

// Loaders
const rgbeLoader = new RGBELoader();

/**
 * Environment map
 */
rgbeLoader.load("/spruit_sunrise.hdr", (environmentMap) => {
  environmentMap.mapping = THREE.EquirectangularReflectionMapping;

  scene.background = environmentMap;
  scene.backgroundBlurriness = 0.5;
  scene.environment = environmentMap;
});

/**
 * Terrain
 */
const geometry = new THREE.PlaneGeometry(10, 10, 500, 500);
geometry.deleteAttribute("uv");
geometry.deleteAttribute("normal");
geometry.rotateX(-Math.PI * 0.5);

debugObject.colorWaterDeep = "#002b3d";
debugObject.colorWaterSurface = "#66a8ff";
debugObject.colorSand = "#ffe894";
debugObject.colorGrass = "#85d534";
debugObject.colorSnow = "#ffffff";
debugObject.colorRock = "#bfbd8d";

const uniforms = {
  uTime: new THREE.Uniform(0),
  uPositionFrequency: new THREE.Uniform(0.2),
  uStrength: new THREE.Uniform(2.0),
  uWarpFrequency: new THREE.Uniform(5),
  uWarpStrength: new THREE.Uniform(0.5),

  uColorWaterDeep: new THREE.Uniform(
    new THREE.Color(debugObject.colorWaterDeep)
  ),
  uColorWaterSurface: new THREE.Uniform(
    new THREE.Color(debugObject.colorWaterSurface)
  ),
  uColorSand: new THREE.Uniform(new THREE.Color(debugObject.colorSand)),
  uColorGrass: new THREE.Uniform(new THREE.Color(debugObject.colorGrass)),
  uColorSnow: new THREE.Uniform(new THREE.Color(debugObject.colorSnow)),
  uColorRock: new THREE.Uniform(new THREE.Color(debugObject.colorRock)),
};

gui
  .add(uniforms.uPositionFrequency, "value", 0, 1, 0.001)
  .name("uPositionFrequency");
gui.add(uniforms.uStrength, "value", 0, 10, 0.001).name("uStrength");
gui.add(uniforms.uWarpFrequency, "value", 0, 10, 0.001).name("uWarpFrequency");
gui.add(uniforms.uWarpStrength, "value", 0, 1, 0.001).name("uWarpStrength");

gui
  .addColor(debugObject, "colorWaterDeep")
  .onChange(() =>
    uniforms.uColorWaterDeep.value.set(debugObject.colorWaterDeep)
  );
gui
  .addColor(debugObject, "colorWaterSurface")
  .onChange(() =>
    uniforms.uColorWaterSurface.value.set(debugObject.colorWaterSurface)
  );
gui
  .addColor(debugObject, "colorSand")
  .onChange(() => uniforms.uColorSand.value.set(debugObject.colorSand));
gui
  .addColor(debugObject, "colorGrass")
  .onChange(() => uniforms.uColorGrass.value.set(debugObject.colorGrass));
gui
  .addColor(debugObject, "colorSnow")
  .onChange(() => uniforms.uColorSnow.value.set(debugObject.colorSnow));
gui
  .addColor(debugObject, "colorRock")
  .onChange(() => uniforms.uColorRock.value.set(debugObject.colorRock));

const material = new CustomShaderMaterial({
  baseMaterial: THREE.MeshStandardMaterial,
  vertexShader: terrainVertexShader,
  fragmentShader: terrainFragmentShader,
  uniforms: uniforms,
  silent: true,

  metalness: 0,
  roughness: 0.5,
  color: "#85D534",
});

const depthMaterial = new CustomShaderMaterial({
  baseMaterial: THREE.MeshDepthMaterial,
  vertexShader: terrainVertexShader,
  uniforms: uniforms,
  silent: true,

  depthPacking: THREE.RGBADepthPacking,
});

const terrain = new THREE.Mesh(geometry, material);
terrain.customDepthMaterial = depthMaterial;
terrain.castShadow = true;
terrain.receiveShadow = true;
scene.add(terrain);

/**
 * Water
 */
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10, 1, 1),
  new THREE.MeshPhysicalMaterial({
    transmission: 1,
    roughness: 0.3,
  })
);
water.rotation.x = -Math.PI * 0.5;
water.position.y = -0.1;
scene.add(water);

/**
 * Clouds
 */
const size = 128;
const cloudData = new Uint8Array(size * size * size);
const perlin = new ImprovedNoise();
const vector = new THREE.Vector3();
let i = 0;

for (let z = 0; z < size; z++) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d =
        1.0 -
        vector
          .set(x, y, z)
          .subScalar(size / 2)
          .divideScalar(size)
          .length();
      cloudData[i] =
        (128 +
          128 * perlin.noise((x * 0.05) / 1.5, y * 0.05, (z * 0.05) / 1.5)) *
        d *
        d;
      i++;
    }
  }
}

const cloudTexture = new THREE.Data3DTexture(cloudData, size, size, size);
cloudTexture.format = THREE.RedFormat;
cloudTexture.minFilter = THREE.LinearFilter;
cloudTexture.magFilter = THREE.LinearFilter;
cloudTexture.unpackAlignment = 1;
cloudTexture.needsUpdate = true;

const cloudGeometry = new THREE.BoxGeometry(1, 1, 1);
const cloudMaterial = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    base: { value: new THREE.Color(0x798aa0) },
    map: { value: cloudTexture },
    cameraPos: { value: new THREE.Vector3() },
    threshold: { value: 0.25 },
    opacity: { value: 0.25 },
    range: { value: 0.1 },
    steps: { value: 100 },
    frame: { value: 0 },
  },
  vertexShader: cloudVertexShader,
  fragmentShader: cloudFragmentShader,
  transparent: true,
  side: THREE.BackSide,
});

const cloud1 = new THREE.Mesh(cloudGeometry, cloudMaterial);
cloud1.position.set(3, 1.5, -2);
cloud1.scale.set(1.5, 1, 1.5);
scene.add(cloud1);

const cloud2 = new THREE.Mesh(cloudGeometry, cloudMaterial);
cloud2.position.set(-3, 1.5, 1);
cloud2.scale.set(2, 1, 1.5);
scene.add(cloud2);

const cloud3 = new THREE.Mesh(cloudGeometry, cloudMaterial);
cloud3.position.set(1, 1.5, 2);
cloud3.scale.set(2, 1, 2.5);
scene.add(cloud3);

const cloud4 = new THREE.Mesh(cloudGeometry, cloudMaterial);
cloud4.position.set(-2, 1.5, -3);
cloud4.scale.set(2, 2, 2);
scene.add(cloud4);

/**
 * Board
 */
// Brushes
const boardFill = new Brush(new THREE.BoxGeometry(11, 2, 11));
const boardHole = new Brush(new THREE.BoxGeometry(10, 2.1, 10));

const evaluator = new Evaluator();
const board = evaluator.evaluate(boardFill, boardHole, SUBTRACTION);

board.geometry.clearGroups();
board.material = new THREE.MeshStandardMaterial({
  color: "#ffffff",
  metalness: 0,
  roughness: 0,
});
board.castShadow = true;
board.receiveShadow = true;

scene.add(board);

/**
 * Lights
 */
const directionalLight = new THREE.DirectionalLight("#ffffff", 2);
directionalLight.position.set(6.25, 3, 4);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(1024, 1024);
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 30;
directionalLight.shadow.camera.top = 8;
directionalLight.shadow.camera.right = 8;
directionalLight.shadow.camera.bottom = -8;
directionalLight.shadow.camera.left = -8;
scene.add(directionalLight);

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  35,
  sizes.width / sizes.height,
  0.1,
  100
);
camera.position.set(-10, 6, -2);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);

/**
 * Animate
 */
const clock = new THREE.Clock();

const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  // Uniforms
  uniforms.uTime.value = elapsedTime;

  // Update Cloud Uniforms
  cloudMaterial.uniforms.cameraPos.value.copy(camera.position);
  cloudMaterial.uniforms.frame.value++;

  // Update controls
  controls.update();

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
