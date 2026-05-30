let currentSimScale = window.innerWidth < 768 ? 0.4 : 0.6;

const waveSpeed = 1;
const damping = 1;
const rippleSize = 2.5;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  premultipliedAlpha: false
});

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.domElement.style.position = 'fixed';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.width = '100vw';
renderer.domElement.style.height = '100vh';
renderer.domElement.style.pointerEvents = 'none';
renderer.domElement.style.zIndex = '9999';

document.body.appendChild(renderer.domElement);

const isWebGL2 = renderer.capabilities?.isWebGL2 || false;

let rtType = THREE.HalfFloatType;

if (isWebGL2) {
  try {
    rtType = THREE.FloatType;
  } catch (e) {
    rtType = THREE.HalfFloatType;
  }
} else {
  rtType = THREE.HalfFloatType !== undefined
    ? THREE.HalfFloatType
    : THREE.UnsignedByteType;
}

let resolution = new THREE.Vector2(
  Math.max(1, Math.floor(window.innerWidth * currentSimScale)),
  Math.max(1, Math.floor(window.innerHeight * currentSimScale))
);

let renderTargetA = new THREE.WebGLRenderTarget(resolution.x, resolution.y, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat,
  type: rtType
});

let renderTargetB = renderTargetA.clone();

const simMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: { value: null },
    uResolution: { value: new THREE.Vector2(resolution.x, resolution.y) },
    uMouse: { value: new THREE.Vector3(-1, -1, 0) },
    uDelta: { value: waveSpeed },
    uDamping: { value: damping },
    uRippleSize: { value: rippleSize },
    uShockwave: { value: 0.0 }
  },

  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D uTexture;
    uniform vec2 uResolution;
    uniform vec3 uMouse;
    uniform float uDelta;
    uniform float uDamping;
    uniform float uRippleSize;
    uniform float uShockwave;

    varying vec2 vUv;

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec2 coord = vUv;

      vec4 data = texture2D(uTexture, coord);

      float pressure = data.x;
      float velocity = data.y;

      float p_right = texture2D(uTexture, coord + vec2(texel.x, 0.0)).x;
      float p_left  = texture2D(uTexture, coord + vec2(-texel.x, 0.0)).x;
      float p_up    = texture2D(uTexture, coord + vec2(0.0, texel.y)).x;
      float p_down  = texture2D(uTexture, coord + vec2(0.0, -texel.y)).x;

      float p_tr = texture2D(uTexture, coord + vec2(texel.x, texel.y)).x;
      float p_tl = texture2D(uTexture, coord + vec2(-texel.x, texel.y)).x;
      float p_br = texture2D(uTexture, coord + vec2(texel.x, -texel.y)).x;
      float p_bl = texture2D(uTexture, coord + vec2(-texel.x, -texel.y)).x;

      if (coord.x < texel.x) p_left = p_right;
      if (coord.x > 1.0 - texel.x) p_right = p_left;
      if (coord.y < texel.y) p_down = p_up;
      if (coord.y > 1.0 - texel.y) p_up = p_down;

      float laplacian =
        (p_right + p_left + p_up + p_down) * 0.2 +
        (p_tr + p_tl + p_br + p_bl) * 0.05 -
        pressure;

      velocity += uDelta * laplacian * 2.0;
      pressure += uDelta * velocity;

      pressure = mix(
        pressure,
        (p_right + p_left + p_up + p_down) * 0.3,
        0.05
      );

      velocity -= 0.002 * uDelta * pressure;
      velocity *= 1.0 - 0.01 * uDelta;
      pressure *= uDamping;

      if (uMouse.z > 0.5) {
        float dist = distance(coord * uResolution, uMouse.xy);
        float force = exp(-dist * dist / (uRippleSize * uRippleSize * 0.5));
        pressure += force * 1.0;
      }

      if (uShockwave > 0.1) {
        float dist = distance(coord * uResolution, uMouse.xy);
        float shockwaveRadius = uRippleSize * 4.0;
        float shockwaveThickness = 80.0;
        float distFromShockwave = abs(dist - shockwaveRadius);

        if (distFromShockwave < shockwaveThickness) {
          float shockStrength = smoothstep(
            shockwaveThickness,
            0.0,
            distFromShockwave
          );

          pressure += pow(shockStrength, 6.0) * 0.4;
        }
      }

      pressure = clamp(pressure, -1.5, 1.5);
      velocity = clamp(velocity, -1.5, 1.5);

      float gradX = (p_right - p_left) / 2.0;
      float gradY = (p_up - p_down) / 2.0;

      gl_FragColor = vec4(pressure, velocity, gradX, gradY);
    }
  `
});

const displayMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: { value: null },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uIsMobile: { value: window.innerWidth < 768 }
  },

  transparent: true,
  blending: THREE.NormalBlending,

  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D uTexture;
    uniform vec2 uResolution;
    uniform bool uIsMobile;

    varying vec2 vUv;

    void main() {
      vec4 data = texture2D(uTexture, vUv);

      vec2 distortion = data.zw * 0.3;
      float waveHeight = data.x;

      vec3 normal = normalize(vec3(-data.z * 4.0, 0.5, -data.w * 4.0));
      vec3 lightDir = normalize(vec3(-2.0, 5.0, 3.0));

      float spec = pow(max(0.0, dot(normal, lightDir)), 800.0);

      vec3 color = vec3(0.2, 0.5, 0.9) * abs(waveHeight) * 1.5;
      color += vec3(1.0) * spec * 1.2;

      if (!uIsMobile) {
        float spec2 = pow(max(0.0, dot(normal, lightDir)), 50.0);
        color += vec3(0.9, 0.95, 1.0) * spec2 * 0.8;

        float caustic = sin(waveHeight * 25.0) * 0.5 + 0.5;

        color += vec3(0.043, 0.110, 0.184)
          * caustic
          * max(0.0, waveHeight)
          * 0.2;
      }

      float alpha =
        0.05 +
        abs(waveHeight) * 0.6 +
        spec * 0.8 +
        length(distortion) * 0.4;

      alpha = clamp(alpha, 0.0, 0.9);

      gl_FragColor = vec4(color, alpha);
    }
  `
});

const geometry = new THREE.PlaneGeometry(2, 2);

const simMesh = new THREE.Mesh(geometry, simMaterial);
const displayMesh = new THREE.Mesh(geometry, displayMaterial);

let currentTarget = renderTargetA;
let previousTarget = renderTargetB;

const mouse = new THREE.Vector2(-1, -1);
const prevMouse = new THREE.Vector2(-1, -1);
const prevPrevMouse = new THREE.Vector2(-1, -1);

let isMouseActive = false;
let shouldTriggerShockwave = false;
let shockwaveTime = 0;

function updateMouseFromEvent(ev) {
  mouse.x = ev.clientX * currentSimScale;
  mouse.y = (window.innerHeight - ev.clientY) * currentSimScale;
}

window.addEventListener('mouseenter', () => {
  isMouseActive = true;
});

window.addEventListener('mouseleave', () => {
  isMouseActive = false;
});

window.addEventListener('mousemove', (e) => {
  isMouseActive = true;
  updateMouseFromEvent(e);
});

window.addEventListener('touchstart', (e) => {
  isMouseActive = true;
  updateMouseFromEvent(e.touches[0]);
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  isMouseActive = true;
  updateMouseFromEvent(e.touches[0]);
}, { passive: true });

window.addEventListener('touchend', () => {
  isMouseActive = false;
});

let lastTime = performance.now();
let badFrames = 0;

function animateWater(currentTime) {
  requestAnimationFrame(animateWater);

  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;

  if (deltaTime > 33) {
    badFrames++;
  } else {
    badFrames = Math.max(0, badFrames - 0.5);
  }

  if (badFrames > 20 && currentSimScale > 0.2) {
    currentSimScale -= 0.1;
    badFrames = 0;
    onResize();
  }

  const mouseMoved =
    Math.abs(mouse.x - prevMouse.x) > 0.5 ||
    Math.abs(mouse.y - prevMouse.y) > 0.5;

  if (isMouseActive) {
    const dx = mouse.x - prevMouse.x;
    const dy = mouse.y - prevMouse.y;

    const prevDx = prevMouse.x - prevPrevMouse.x;
    const prevDy = prevMouse.y - prevPrevMouse.y;

    const movement = Math.sqrt(dx * dx + dy * dy);
    const prevMovement = Math.sqrt(prevDx * prevDx + prevDy * prevDy);

    if (prevMovement > 2 && movement < 1) {
      shouldTriggerShockwave = true;
      shockwaveTime = 0;
    }

    if (movement > 1 && prevMovement > 1) {
      const dot = dx * prevDx + dy * prevDy;
      const denom = Math.max(0.0001, movement * prevMovement);
      const angle = Math.acos(Math.min(1, Math.max(-1, dot / denom)));

      if (angle > Math.PI / 3) {
        shouldTriggerShockwave = true;
        shockwaveTime = 0;
      }
    }
  }

  if (shockwaveTime < 10) {
    shockwaveTime++;
  }

  simMaterial.uniforms.uTexture.value = previousTarget.texture;

  simMaterial.uniforms.uMouse.value.set(
    mouse.x,
    mouse.y,
    isMouseActive && mouseMoved ? 1 : 0
  );

  simMaterial.uniforms.uDelta.value = waveSpeed;
  simMaterial.uniforms.uDamping.value = damping;
  simMaterial.uniforms.uRippleSize.value = rippleSize;

  simMaterial.uniforms.uShockwave.value =
    shouldTriggerShockwave && shockwaveTime < 2 ? 1.0 : 0.0;

  renderer.setRenderTarget(currentTarget);

  scene.add(simMesh);
  renderer.render(scene, camera);
  scene.remove(simMesh);

  displayMaterial.uniforms.uTexture.value = currentTarget.texture;
  displayMaterial.uniforms.uResolution.value.set(
    window.innerWidth,
    window.innerHeight
  );

  renderer.setRenderTarget(null);

  scene.add(displayMesh);
  renderer.render(scene, camera);
  scene.remove(displayMesh);

  [currentTarget, previousTarget] = [previousTarget, currentTarget];

  prevPrevMouse.copy(prevMouse);
  prevMouse.copy(mouse);

  if (shockwaveTime > 3) {
    shouldTriggerShockwave = false;
  }
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer.setSize(w, h);

  displayMaterial.uniforms.uIsMobile.value = w < 768;

  resolution.set(
    Math.max(1, Math.floor(w * currentSimScale)),
    Math.max(1, Math.floor(h * currentSimScale))
  );

  renderTargetA.setSize(resolution.x, resolution.y);
  renderTargetB.setSize(resolution.x, resolution.y);

  simMaterial.uniforms.uResolution.value.set(resolution.x, resolution.y);
}

window.addEventListener('resize', onResize);

requestAnimationFrame((time) => {
  lastTime = time;
  animateWater(time);
});

