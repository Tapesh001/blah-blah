import type { MeshStandardMaterial } from 'three';

export type GraphicsQuality = 'high' | 'ultra';
export const GRAPHICS = {
  high: {
    scale: 1,
    maxRatio: 1,
    shadow: 1024,
    ocean: 128,
    grass: 24000,
    cloudSteps: 8,
    reflection: 256,
    samples: 0,
  },
  ultra: {
    scale: 1,
    maxRatio: 1.25,
    shadow: 2048,
    ocean: 256,
    grass: 60000,
    cloudSteps: 12,
    reflection: 768,
    samples: 2,
  },
} as const;

export function savedGraphics(): GraphicsQuality {
  try {
    return localStorage.getItem('cg-graphics-performance') === 'ultra'
      ? 'ultra'
      : 'high';
  } catch {
    return 'high';
  }
}

/** Bound physical pixels as well as dimensions, including 4K and HiDPI screens. */
export function graphicsRatio(
  width: number,
  height: number,
  deviceRatio: number,
  quality: GraphicsQuality,
  maxSize: number,
  renderScale = 1,
) {
  const settings = GRAPHICS[quality];
  return (
    renderScale *
    Math.min(
      settings.maxRatio,
      deviceRatio * settings.scale,
      maxSize / width,
      maxSize / height,
      Math.sqrt(
        (quality === 'ultra' ? 3_000_000 : 2_100_000) / (width * height),
      ),
    )
  );
}

/** React to sustained frame cost, not single compilation spikes or hidden tabs. */
export class FrameBudget {
  scale = 1;
  private warmup = 1500;
  private elapsed = 0;
  private frames = 0;
  private fastWindows = 0;

  reset() {
    this.scale = 1;
    this.warmup = 1500;
    this.elapsed = this.frames = this.fastWindows = 0;
  }

  sample(ms: number, quality: GraphicsQuality): 'high' | 'resize' | null {
    if (!Number.isFinite(ms) || ms <= 0 || ms >= 1000) return null;
    if (this.warmup > 0) {
      this.warmup -= ms;
      return null;
    }
    this.elapsed += ms;
    this.frames++;
    if (this.elapsed < 2000) return null;
    const average = this.elapsed / this.frames;
    this.elapsed = this.frames = 0;
    if (quality === 'ultra' && average > 40) return 'high';
    const previous = this.scale;
    if (average > 25) {
      this.scale = Math.max(0.6, Math.round((this.scale - 0.1) * 100) / 100);
      this.fastWindows = 0;
    } else if (average < 17) {
      if (++this.fastWindows >= 2) {
        this.scale = Math.min(1, Math.round((this.scale + 0.05) * 100) / 100);
        this.fastWindows = 0;
      }
    } else this.fastWindows = 0;
    return previous !== this.scale ? 'resize' : null;
  }
}

/** Procedural rock/soil grain supplies close-up color and view-space bump detail. */
export function detailTerrain(material: MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute float roadDistance; varying float vRoadDistance; varying vec3 vSurfacePosition; varying vec3 vSurfaceNormal;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvSurfacePosition = (modelMatrix * vec4(transformed, 1.0)).xyz; vRoadDistance = roadDistance; vSurfaceNormal = normalize(mat3(modelMatrix)*normal);',
    );
    shader.fragmentShader =
      `
varying vec3 vSurfacePosition; varying vec3 vSurfaceNormal; varying float vRoadDistance;
float surfaceHash(vec3 p) { p=fract(p*0.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
float surfaceNoise(vec3 p) {
 vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(mix(surfaceHash(i),surfaceHash(i+vec3(1,0,0)),f.x),mix(surfaceHash(i+vec3(0,1,0)),surfaceHash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(surfaceHash(i+vec3(0,0,1)),surfaceHash(i+vec3(1,0,1)),f.x),mix(surfaceHash(i+vec3(0,1,1)),surfaceHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
 float road = 1.-smoothstep(3.0,4.5,vRoadDistance);
 float detailFade = 1.-smoothstep(35.,160.,length(vViewPosition));
 float mineral = surfaceNoise(vSurfacePosition*2.5)*0.65 + surfaceNoise(vSurfacePosition*17.)*0.35;
 vec3 grainFootprint = fwidth(vSurfacePosition*48.);
 float grainVisibility = 1.-smoothstep(0.25,1.,max(max(grainFootprint.x,grainFootprint.y),grainFootprint.z));
 float aggregate = mix(0.5,surfaceNoise(vSurfacePosition*48.),grainVisibility);
 float strata = sin(vSurfacePosition.y*9.+surfaceNoise(vSurfacePosition*0.8)*5.);
 float cliff = 1.-smoothstep(0.65,0.88,abs(vSurfaceNormal.y));
 diffuseColor.rgb *= mix(mix(0.72,1.18,mineral)*(1.+cliff*strata*0.10),mix(0.82,1.2,aggregate),road*detailFade);
 // Fine asphalt grains stay separate from the larger rock and soil pattern.
 diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.075,0.083,0.087)*(0.85+aggregate*0.35),road*0.65);
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
 float grain = (surfaceNoise(vSurfacePosition*6.)*0.035 + surfaceNoise(vSurfacePosition*28.)*0.006)*(1.-road)/(1.+length(vViewPosition)*0.04);
 vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition);
 vec3 r1=cross(sy,normal), r2=cross(normal,sx);
 float det=dot(sx,r1);
 vec3 gradient=sign(det)*(dFdx(grain)*r1+dFdy(grain)*r2);
 normal=normalize(abs(det)*normal-gradient);
`,
    );
    // Asphalt stays matte in rain as well: no sharp sun/environment glints.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
 material.roughness = mix(material.roughness,1.,road);
 material.specularColor *= 1.-road;
 material.specularColorBlended *= 1.-road;
 material.specularF90 *= 1.-road;
`,
    );
  };
  material.customProgramCacheKey = () => 'terrain-detail-v3-matte-road';
}
