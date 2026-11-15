import { ExtrudeGeometry, Path, Shape } from 'three';

/** Involute flanks around a 20° pressure-angle base circle, with bevelled tips. */
export function gearGeometry(
  teeth: number,
  radius = teeth * 0.004,
  depth = 0.035,
): ExtrudeGeometry {
  const module = (radius * 2) / teeth,
    root = radius - 1.15 * module,
    tip = radius + module;
  const base = radius * Math.cos((20 * Math.PI) / 180);
  const involute = (r: number) => {
    const t = Math.sqrt(Math.max(0, (r / base) ** 2 - 1));
    return t - Math.atan(t);
  };
  const pitchInvolute = involute(radius),
    halfTooth = Math.PI / (2 * teeth);
  const shape = new Shape();
  const point = (r: number, a: number, first = false) => {
    if (first) shape.moveTo(r * Math.cos(a), r * Math.sin(a));
    else shape.lineTo(r * Math.cos(a), r * Math.sin(a));
  };
  for (let tooth = 0; tooth < teeth; tooth++) {
    const center = (tooth * Math.PI * 2) / teeth;
    point(root, center - Math.PI / teeth, tooth === 0);
    point(root, center - halfTooth - pitchInvolute);
    for (let step = 0; step <= 4; step++) {
      const r =
        Math.max(root, base) + ((tip - Math.max(root, base)) * step) / 4;
      point(r, center - halfTooth - pitchInvolute + involute(r));
    }
    for (let step = 4; step >= 0; step--) {
      const r =
        Math.max(root, base) + ((tip - Math.max(root, base)) * step) / 4;
      point(r, center + halfTooth + pitchInvolute - involute(r));
    }
    point(root, center + halfTooth + pitchInvolute);
    point(root, center + Math.PI / teeth);
  }
  shape.closePath();
  const hole = new Path();
  hole.absarc(0, 0, radius * 0.16, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  if (teeth >= 16)
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5,
        lightening = new Path();
      lightening.absarc(
        Math.cos(angle) * radius * 0.52,
        Math.sin(angle) * radius * 0.52,
        radius * 0.17,
        0,
        Math.PI * 2,
        true,
      );
      shape.holes.push(lightening);
    }
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(0.0012, module * 0.16),
    bevelThickness: Math.min(0.0012, depth * 0.15),
    curveSegments: 12,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}
