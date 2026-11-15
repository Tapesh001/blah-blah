import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  OrthographicCamera,
  ShaderMaterial,
  WebGLRenderTarget,
  HalfFloatType,
  RGBAFormat,
  LinearSRGBColorSpace,
  LinearFilter,
} from 'three';

export function hdrTarget(width, height, name, depthBuffer = false) {
  const target = new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    format: RGBAFormat,
    internalFormat: 'RGBA16F',
    colorSpace: LinearSRGBColorSpace,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.name = name;
  return target;
}

export class PingPongTargets {
  constructor() {
    this.read = hdrTarget(1, 1, 'gfx.post.a');
    this.write = hdrTarget(1, 1, 'gfx.post.b');
  }
  swap() {
    [this.read, this.write] = [this.write, this.read];
  }
  resize(width, height) {
    this.read.setSize(width, height);
    this.write.setSize(width, height);
  }
  dispose() {
    this.read.dispose();
    this.write.dispose();
  }
}

/** Instance-owned triangle: disposing one pipeline cannot break another. */
export class FullscreenTriangle {
  constructor() {
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    this.geometry.setAttribute(
      'uv',
      new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
    );
    this.mesh = new Mesh(this.geometry);
    this.mesh.frustumCulled = false;
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, this.camera);
  }
  dispose() {
    this.geometry.dispose();
  }
}

export function fullscreenMaterial(fragmentShader, uniforms = {}) {
  return new ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }',
    fragmentShader,
  });
}

// T0.1 diagnostic presentation only. T0.2 replaces this with exposure, bloom and AgX/ACES.
export function presentationMaterial() {
  return fullscreenMaterial(
    `
    uniform sampler2D source;
    varying vec2 vUv;
    void main() {
      vec3 linearColor = max(texture2D(source, vUv).rgb, vec3(0.0));
      gl_FragColor = vec4(linearColor / (vec3(1.0) + linearColor), 1.0);
      #include <colorspace_fragment>
    }
  `,
    { source: { value: null } },
  );
}
