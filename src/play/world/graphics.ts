import type { MeshStandardMaterial } from 'three';

export type GraphicsQuality = 'high' | 'ultra';
export const GRAPHICS = {
  high: {
    scale: 1,
    maxRatio: 1,
    shadow: 1536,
    ocean: 200,
    grass: 80000,
    cloudSteps: 8,
    reflection: 384,
    samples: 0,
  },
  ultra: {
    scale: 1.5,
    maxRatio: 2,
    shadow: 4096,
    ocean: 640,
    grass: 240000,
    cloudSteps: 24,
    reflection: 2048,
    samples: 4,
  },
} as const;

export function savedGraphics(): GraphicsQuality {
  try {
    return localStorage.getItem('cg-graphics2') === 'ultra' ? 'ultra' : 'high';
  } catch {
    return 'high';
  }
}

/** Dynamic resolution: the main loop lowers this when frames run long. */
export const dynamic = { scale: 1 };

/** Bound physical pixels as well as dimensions, including 4K and HiDPI screens. */
export function graphicsRatio(
  width: number,
  height: number,
  deviceRatio: number,
  quality: GraphicsQuality,
  maxSize: number,
) {
  const settings = GRAPHICS[quality];
  return (
    dynamic.scale *
    Math.min(
      settings.maxRatio,
      deviceRatio * settings.scale,
      maxSize / width,
      maxSize / height,
      Math.sqrt(8_000_000 / (width * height)),
    )
  );
}

/** Procedural rock/soil grain supplies close-up color and view-space bump detail. */
export function detailTerrain(material: MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vSurfacePosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvSurfacePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader =
      `
varying vec3 vSurfacePosition;
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
 float mineral = surfaceNoise(vSurfacePosition*2.5)*0.65 + surfaceNoise(vSurfacePosition*17.)*0.35;
 diffuseColor.rgb *= mix(0.68,1.16,mineral);
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
 float grain = (surfaceNoise(vSurfacePosition*6.)*0.02 + surfaceNoise(vSurfacePosition*28.)*0.004)/(1.+length(vViewPosition)*0.03);
 vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition);
 vec3 r1=cross(sy,normal), r2=cross(normal,sx);
 float det=dot(sx,r1);
 vec3 gradient=sign(det)*(dFdx(grain)*r1+dFdy(grain)*r2);
 normal=normalize(abs(det)*normal-gradient);
`,
    );
  };
  material.customProgramCacheKey = () => 'terrain-detail-v1';
}
