const GRAVITY = 9.81;
const TAU = 2 * Math.PI;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const RATIOS = [1, 0.83, 0.68, 0.55, 0.44, 0.35, 0.28, 0.22, 0.17, 1.8];
const WEIGHTS = [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.22, 0.16, 0.12, 0.65];
const ENERGY_SCALE = Math.sqrt(WEIGHTS.reduce((sum, w) => sum + w * w, 0) / 2);

function stormHeight(storm) {
  return storm <= 0.5 ? 0.4 + 1.6 * storm : 1.2 + 3.6 * (storm - 0.5);
}

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

/**
 * CPU Gerstner surface. Units are metres, seconds, radians and m/s. Y is up.
 * env = { storm, windHeading?, windSpeed? }; heading is propagation toward +X
 * at zero, toward +Z at PI/2. rng is a function returning a number in [0, 1).
 *
 * For material coordinate u=(x,z), wave phase theta=k dot(d,u)-phase+offset:
 * P.xz = u + sum(q A d cos(theta)), P.y = sum(A sin(theta)).
 * phase integrates sqrt(g k). q=steepness/waveCount prevents folding and keeps
 * the prescribed two fixed-point inversion passes accurate across sea states.
 * Parameters relax exponentially over 10 seconds. Integrating phase, rather
 * than multiplying time by changing frequency, preserves wave continuity.
 */
export function createOcean(env, rng = Math.random) {
  const initialStorm = clamp(finite(env.storm, 'storm'), 0, 1);
  const heading = finite(env.windHeading ?? 0, 'windHeading');
  const waves = RATIOS.map((ratio, index) => {
    const random = finite(rng(), 'rng result');
    if (random < 0 || random >= 1) throw new RangeError('rng must return a value in [0, 1)');
    const angle = heading + (index === 9 ? -50 : -35 + index * 70 / 8) * Math.PI / 180;
    return {
      direction: { x: Math.cos(angle), z: Math.sin(angle) },
      amplitude: stormHeight(initialStorm) * WEIGHTS[index] / (4 * ENERGY_SCALE),
      wavelength: (18 + 42 * initialStorm) * ratio,
      steepness: (0.25 + 0.35 * initialStorm) / RATIOS.length,
      phase: 0,
      offset: random * TAU,
    };
  });
  let time = 0;

  // Scratch data is private to this instance. Repeated height/sample calls
  // allocate nothing when sample receives a reusable output object.
  const displacement = { x: 0, z: 0 };
  function horizontal(x, z) {
    displacement.x = 0;
    displacement.z = 0;
    for (const wave of waves) {
      const k = TAU / wave.wavelength;
      const theta = k * (wave.direction.x * x + wave.direction.z * z) - wave.phase + wave.offset;
      const offset = wave.steepness * wave.amplitude * Math.cos(theta);
      displacement.x += wave.direction.x * offset;
      displacement.z += wave.direction.z * offset;
    }
  }

  function sample(x, z, out = { height: 0, normal: {}, velocity: {} }) {
    finite(x, 'x');
    finite(z, 'z');
    let u = x;
    let v = z;
    for (let iteration = 0; iteration < 2; iteration++) {
      horizontal(u, v);
      u = x - displacement.x;
      v = z - displacement.z;
    }
    let height = 0;
    let xx = 1, xz = 0, zz = 1, yx = 0, yz = 0;
    let vx = 0, vy = 0, vz = 0;
    for (const wave of waves) {
      const { direction: d, amplitude: a, steepness: q } = wave;
      const k = TAU / wave.wavelength;
      const omega = Math.sqrt(GRAVITY * k);
      const theta = k * (d.x * u + d.z * v) - wave.phase + wave.offset;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      height += a * sin;
      const slope = q * a * k * sin;
      xx -= slope * d.x * d.x;
      xz -= slope * d.x * d.z;
      zz -= slope * d.z * d.z;
      yx += a * k * d.x * cos;
      yz += a * k * d.z * cos;
      vx += q * a * omega * d.x * sin;
      vy -= a * omega * cos;
      vz += q * a * omega * d.z * sin;
    }
    const nx = yz * xz - zz * yx;
    const ny = zz * xx - xz * xz;
    const nz = xz * yx - yz * xx;
    const length = Math.hypot(nx, ny, nz);
    out.height = height;
    out.normal.x = nx / length;
    out.normal.y = ny / length;
    out.normal.z = nz / length;
    out.velocity.x = vx;
    out.velocity.y = vy;
    out.velocity.z = vz;
    return out;
  }
  const heightSample = { height: 0, normal: {}, velocity: {} };

  return {
    waves,
    get time() { return time; },
    get whitecaps() { return clamp(((env.windSpeed ?? 7) - 7) / 13, 0, 1); },
    get significantHeight() {
      return 4 * Math.sqrt(waves.reduce((sum, wave) => sum + wave.amplitude ** 2 / 2, 0));
    },
    update(dt) {
      finite(dt, 'dt');
      if (dt < 0) throw new RangeError('dt must be nonnegative');
      const storm = clamp(finite(env.storm, 'storm'), 0, 1);
      const blend = -Math.expm1(-dt / 10);
      for (let i = 0; i < waves.length; i++) {
        const wave = waves[i];
        const oldOmega = Math.sqrt(GRAVITY * TAU / wave.wavelength);
        wave.amplitude += (stormHeight(storm) * WEIGHTS[i] / (4 * ENERGY_SCALE) - wave.amplitude) * blend;
        wave.wavelength += ((18 + 42 * storm) * RATIOS[i] - wave.wavelength) * blend;
        wave.steepness += ((0.25 + 0.35 * storm) / waves.length - wave.steepness) * blend;
        const newOmega = Math.sqrt(GRAVITY * TAU / wave.wavelength);
        wave.phase = (wave.phase + dt * (oldOmega + newOmega) / 2) % TAU;
      }
      time += dt;
    },
    height(x, z) { return sample(x, z, heightSample).height; },
    sample,
  };
}
