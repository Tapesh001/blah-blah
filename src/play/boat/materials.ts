import type { MeshStandardMaterial } from 'three';

/** Analytic timber grain and cloth weave, with derivative filtering at distance. */
export function addSurfaceDetail(
  material: MeshStandardMaterial,
  kind: 'wood' | 'cloth',
) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vDetailPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvDetailPosition = position;',
    );
    shader.fragmentShader =
      'varying vec3 vDetailPosition;\n' + shader.fragmentShader;
    const pattern =
      kind === 'wood'
        ? `float line = vDetailPosition.x * 70. + sin(vDetailPosition.z*2.5+vDetailPosition.y*0.8)*2.5;
         float grain = sin(line)*0.5+0.5;
         float filtered = 1.-smoothstep(0.5,3.,fwidth(line));
         diffuseColor.rgb *= 0.87 + 0.17*mix(0.5,grain,filtered);`
        : `vec2 weaveUV = vDetailPosition.yz*150.;
         float filtered = 1.-smoothstep(0.5,3.,max(fwidth(weaveUV.x),fwidth(weaveUV.y)));
         float weave = sin(weaveUV.x)*sin(weaveUV.y);
         diffuseColor.rgb *= 0.97 + 0.035*weave*filtered;`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' + pattern,
    );
  };
  material.customProgramCacheKey = () => `boat-${kind}-detail-v1`;
}
