import type { MeshStandardMaterial } from 'three';

/** Analytic timber grain and cloth weave, with derivative filtering at distance. */
export function addSurfaceDetail(
  material: MeshStandardMaterial,
  kind: 'wood' | 'cloth',
) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vDetailPosition; varying vec2 vDetailUV;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvDetailPosition = position; vDetailUV = uv;',
    );
    shader.fragmentShader =
      'varying vec3 vDetailPosition; varying vec2 vDetailUV;\n' +
      shader.fragmentShader;
    const pattern =
      kind === 'wood'
        ? `float warp = sin(vDetailPosition.z*1.8+vDetailPosition.y*2.3)*0.7 + sin(vDetailPosition.z*5.3)*0.15;
         float line = vDetailPosition.x*95. + warp*6.;
         float grain = sin(line)*0.5+0.5;
         float filtered = 1.-smoothstep(0.5,3.,fwidth(line));
         float rings = sin(line*0.23+sin(vDetailPosition.z*0.8))*0.5+0.5;
         diffuseColor.rgb *= 0.76 + 0.18*mix(0.5,grain,filtered)+0.16*rings;`
        : `vec2 weaveUV = vDetailUV*vec2(420.,700.);
         float filtered = 1.-smoothstep(0.5,3.,max(fwidth(weaveUV.x),fwidth(weaveUV.y)));
         float weave = sin(weaveUV.x)*sin(weaveUV.y);
         diffuseColor.rgb *= 0.97 + 0.035*weave*filtered;
         float panel = vDetailUV.y*7.;
         float seamDistance = min(fract(panel),1.-fract(panel));
         float seam = 1.-smoothstep(0.018,0.018+max(fwidth(panel),0.008),seamDistance);
         float border = 1.-smoothstep(0.012,0.024,min(vDetailUV.x,1.-vDetailUV.x));
         diffuseColor.rgb *= 1.-seam*0.17-border*0.13;
         float stitch = step(0.45,fract(vDetailUV.x*110.))*seam;
         diffuseColor.rgb += stitch*vec3(0.04,0.035,0.025);`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' + pattern,
    );
  };
  material.customProgramCacheKey = () => `boat-${kind}-detail-v2`;
}
