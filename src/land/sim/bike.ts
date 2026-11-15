/** Independent M0 single-track model. Metres, kilograms, seconds, radians.
 * Fixed 60 Hz calls, four spring/tyre/controller substeps. No scene objects or IO.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export type Surface = 'tarmac' | 'wood' | 'gravel' | 'grass' | 'sand' | 'mud';
export interface Ground {
  height: number;
  normal: Vec3;
  surface: Surface;
  wetness: number;
}
export interface BikeWorld {
  sample(x: number, z: number): Ground;
  wind(x: number, y: number, z: number, time: number): Vec3;
  /** Optional downward wheel ray for props; return the nearest support. */
  raycast?(origin: Vec3, length: number): Ground | null;
  solidHit?(from: Vec3, to: Vec3): boolean;
}
export interface BikeInput {
  throttle?: number;
  steer?: number;
  run?: boolean;
  sprint?: boolean;
  jump?: boolean;
  assist?: boolean;
}
export interface Drivetrain {
  chainring: number;
  cogs: number[];
  efficiency: number;
  durability: number;
}
export const STOCK_DRIVETRAIN: Drivetrain = {
  chainring: 38,
  cogs: [11, 13, 15, 18, 21, 24, 28, 32],
  efficiency: 0.96,
  durability: 1,
};
export const BIKE = Object.freeze({
  mass: 85,
  wheelbase: 1.08,
  height: 1.05,
  rearOffset: 0.48,
  radius: 0.34,
  spring: 60000,
  damping: 3500,
  travel: 0.06,
  gravity: 9.81,
  fixedDt: 1 / 60,
  substeps: 4,
});
export const SURFACES: Record<
  Surface,
  { rolling: number; dry: number; wet: number }
> = {
  tarmac: { rolling: 0.004, dry: 0.9, wet: 0.6 },
  wood: { rolling: 0.006, dry: 0.7, wet: 0.35 },
  gravel: { rolling: 0.012, dry: 0.6, wet: 0.5 },
  grass: { rolling: 0.02, dry: 0.45, wet: 0.3 },
  sand: { rolling: 0.035, dry: 0.4, wet: 0.32 },
  mud: { rolling: 0.04, dry: 0.3, wet: 0.3 },
};
export interface BikeState {
  position: Vec3;
  velocity: Vec3;
  heading: number;
  lean: number;
  leanRate: number;
  steer: number;
  pitch: number;
  wheelSpin: [number, number];
  crankAngle: number;
  cadence: number;
  gearIndex: number;
  compression: [number, number];
  grounded: [boolean, boolean];
  normalLoad: [number, number];
  chainWear: number;
  riderEffort: number;
  stamina: number;
  time: number;
  distance: number;
  targetLean: number;
  leanLimit: number;
  torque: number;
  skid: boolean;
  frontLock: boolean;
  crashTimer: number;
  crashes: number;
  slipTime: number;
  preload: number;
  jumpHeld: boolean;
  contactDelay: number;
  longitudinalAcceleration: number;
  safe: { position: Vec3; heading: number };
}
export type BikeEvent =
  | { type: 'bike:crash'; reason: string }
  | { type: 'bike:respawn' }
  | { type: 'bike:landing'; impulse: number; trauma: number }
  | { type: 'bike:hop' };
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const finiteInput = (n: number | undefined) =>
  Number.isFinite(n) ? clamp(n!, -1, 1) : 0;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const grip = (surface: Surface, wetness: number): number => {
  const p = SURFACES[surface];
  return p.dry + (p.wet - p.dry) * clamp(wetness, 0, 1);
};
export const flatWorld: BikeWorld = {
  sample: () => ({
    height: 0,
    normal: { x: 0, y: 1, z: 0 },
    surface: 'tarmac',
    wetness: 0,
  }),
  wind: () => ({ x: 0, y: 0, z: 0 }),
};

export function createBike(
  position: Partial<Vec3> = {},
  heading = 0,
): BikeState {
  const p = {
    x: position.x ?? 0,
    y: position.y ?? BIKE.height,
    z: position.z ?? 0,
  };
  return {
    position: p,
    velocity: { x: 0, y: 0, z: 0 },
    heading,
    lean: 0,
    leanRate: 0,
    steer: 0,
    pitch: 0,
    wheelSpin: [0, 0],
    crankAngle: 0,
    cadence: 0,
    gearIndex: 4,
    compression: [0, 0],
    grounded: [false, false],
    normalLoad: [0, 0],
    chainWear: 0,
    riderEffort: 0,
    stamina: 1,
    time: 0,
    distance: 0,
    targetLean: 0,
    leanLimit: 0,
    torque: 0,
    skid: false,
    frontLock: false,
    crashTimer: 0,
    crashes: 0,
    slipTime: 0,
    preload: 0,
    jumpHeld: false,
    contactDelay: 0,
    longitudinalAcceleration: 0,
    safe: { position: { ...p }, heading },
  };
}

/** Available lateral force after drive/brakes have used part of the friction circle. */
export function lateralCapacity(
  mu: number,
  load: number,
  longitudinal: number,
): number {
  return Math.sqrt(Math.max(0, (mu * load) ** 2 - longitudinal ** 2));
}
/** Analytical steady-circle check, also used by the model's slip detector. */
export function cornerDemand(
  speed: number,
  steer: number,
  mu: number,
): { required: number; available: number; holds: boolean } {
  const required = (speed * speed * Math.abs(Math.tan(steer))) / BIKE.wheelbase;
  const available = mu * BIKE.gravity;
  return { required, available, holds: required <= available + 1e-9 };
}

export function stepBike(
  s: BikeState,
  input: BikeInput,
  world: BikeWorld = flatWorld,
  drivetrain: Drivetrain = STOCK_DRIVETRAIN,
  dt = BIKE.fixedDt,
): BikeEvent[] {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1 / 30)
    throw new RangeError('Use fixed steps of at most 1/30 second');
  if (
    !Number.isFinite(drivetrain.chainring) ||
    drivetrain.chainring <= 0 ||
    !drivetrain.cogs.length ||
    drivetrain.cogs.some((c) => !Number.isFinite(c) || c <= 0) ||
    !Number.isFinite(drivetrain.efficiency) ||
    drivetrain.efficiency < 0 ||
    drivetrain.efficiency > 1 ||
    !Number.isFinite(drivetrain.durability) ||
    drivetrain.durability <= 0
  )
    throw new RangeError('Invalid drivetrain');
  const events: BikeEvent[] = [],
    h = dt / BIKE.substeps,
    m = BIKE.mass,
    g = BIKE.gravity;
  const throttle = finiteInput(input.throttle),
    steering = finiteInput(input.steer),
    assist = input.assist !== false;
  s.gearIndex = clamp(Math.trunc(s.gearIndex), 0, drivetrain.cogs.length - 1);
  if (
    input.jump &&
    !s.jumpHeld &&
    s.grounded.some(Boolean) &&
    s.preload === 0 &&
    !s.crashTimer
  )
    s.preload = 0.12;
  s.jumpHeld = !!input.jump;
  const crash = (reason: string) => {
    if (s.crashTimer > 0) return;
    s.crashTimer = 1.2;
    s.crashes++;
    events.push({ type: 'bike:crash', reason });
  };
  for (let step = 0; step < BIKE.substeps; step++) {
    s.time += h;
    s.contactDelay = Math.max(0, s.contactDelay - h);
    const forward = { x: Math.cos(s.heading), z: Math.sin(s.heading) },
      right = { x: -forward.z, z: forward.x };
    let speed = s.velocity.x * forward.x + s.velocity.z * forward.z;
    const side = s.velocity.x * right.x + s.velocity.z * right.z;
    const offsets = [
      BIKE.wheelbase - BIKE.rearOffset,
      -BIKE.rearOffset,
    ] as const;
    const sampleWheel = (offset: number): Ground => {
      const x = s.position.x + offset * forward.x,
        z = s.position.z + offset * forward.z;
      const ground = world.sample(x, z);
      const prop = world.raycast?.(
        { x, y: s.position.y + 0.5, z },
        BIKE.height + 1,
      );
      return prop &&
        prop.height > ground.height &&
        prop.height <= s.position.y + 0.5
        ? prop
        : ground;
    };
    const grounds: [Ground, Ground] = [
      sampleWheel(offsets[0]),
      sampleWheel(offsets[1]),
    ];
    const roadHeight =
      grounds[1].height +
      (BIKE.rearOffset / BIKE.wheelbase) *
        (grounds[0].height - grounds[1].height);
    const roadPitch = Math.atan2(
      grounds[0].height - grounds[1].height,
      BIKE.wheelbase,
    );
    const wasGrounded = s.grounded.some(Boolean);
    const incomingVertical = s.velocity.y;
    const transfer = clamp(
      (-m * s.longitudinalAcceleration * BIKE.height) / BIKE.wheelbase,
      -m * g * 0.35,
      m * g * 0.45,
    );
    for (const wheel of [0, 1] as const) {
      const staticLoad =
        (m *
          g *
          (wheel === 0 ? BIKE.rearOffset : BIKE.wheelbase - BIKE.rearOffset)) /
        BIKE.wheelbase;
      const compression =
        staticLoad / BIKE.spring +
        grounds[wheel].height -
        (s.position.y - BIKE.height + Math.tan(s.pitch) * offsets[wheel]);
      s.compression[wheel] = clamp(compression, 0, BIKE.travel);
      // Damping uses velocity relative to the support surface, not world vertical.
      const n = grounds[wheel].normal;
      const normalVelocity =
        s.velocity.y +
        (s.velocity.x * n.x + s.velocity.z * n.z) / Math.max(0.2, n.y);
      const load =
        compression > 0 && s.contactDelay === 0
          ? Math.max(
              0,
              BIKE.spring * s.compression[wheel] -
                BIKE.damping * normalVelocity +
                (wheel === 0 ? transfer : -transfer),
            )
          : 0;
      s.normalLoad[wheel] = Math.min(load, m * g * 5);
      s.grounded[wheel] = s.normalLoad[wheel] > 0;
    }
    const grounded = s.grounded.some(Boolean);
    const load = s.normalLoad[0] + s.normalLoad[1];
    if (!wasGrounded && grounded && incomingVertical < -0.6) {
      const impulse =
        m * Math.max(0, -incomingVertical + speed * Math.tan(roadPitch));
      const alignment = Math.max(
        Math.abs(s.lean),
        Math.abs(s.pitch - roadPitch),
      );
      events.push({
        type: 'bike:landing',
        impulse,
        trauma: clamp((impulse - 250) / 350, 0, 1),
      });
      if (impulse > 250)
        s.chainWear = clamp(
          s.chainWear + (impulse - 250) / 4000 / drivetrain.durability,
          0,
          1,
        );
      if (impulse > 600 || alignment > (35 * Math.PI) / 180)
        crash('hard landing');
    }
    if (s.crashTimer > 0) {
      s.crashTimer = Math.max(0, s.crashTimer - h);
      s.velocity.x *= Math.exp(-3 * h);
      s.velocity.z *= Math.exp(-3 * h);
      s.velocity.y -= g * h;
      s.position.x += s.velocity.x * h;
      s.position.z += s.velocity.z * h;
      s.position.y = Math.max(
        roadHeight + BIKE.height,
        s.position.y + s.velocity.y * h,
      );
      if (s.position.y <= roadHeight + BIKE.height) s.velocity.y = 0;
      s.lean = wrap(s.lean + 5 * h);
      if (s.crashTimer === 0) {
        s.position = { ...s.safe.position };
        s.heading = s.safe.heading;
        s.velocity = {
          x: 1.4 * Math.cos(s.heading),
          y: 0,
          z: 1.4 * Math.sin(s.heading),
        };
        s.lean =
          s.leanRate =
          s.steer =
          s.pitch =
          s.slipTime =
          s.preload =
          s.longitudinalAcceleration =
            0;
        events.push({ type: 'bike:respawn' });
      }
      continue;
    }
    const mu: [number, number] = [
      grip(grounds[0].surface, grounds[0].wetness),
      grip(grounds[1].surface, grounds[1].wetness),
    ];
    const muMean = (mu[0] + mu[1]) / 2;
    s.leanLimit = Math.min((42 * Math.PI) / 180, Math.atan(muMean * 0.92));
    s.targetLean = steering * (assist ? s.leanLimit : (42 * Math.PI) / 180);
    const lowSpeed = clamp(Math.abs(speed) / 2.5, 0, 1);
    const desiredAcceleration =
      16 * (s.targetLean * lowSpeed - s.lean) - 7 * s.leanRate;
    // Invert the pendulum equation: steering away first initiates a lean.
    const desiredSteer = Math.atan(
      (BIKE.wheelbase *
        (g * Math.sin(s.lean) - BIKE.height * desiredAcceleration)) /
        (Math.max(speed * speed, 2.5 ** 2) * Math.max(0.35, Math.cos(s.lean))),
    );
    s.steer +=
      (clamp(desiredSteer, -0.6, 0.6) - s.steer) * (1 - Math.exp(-h / 0.06));
    const wind = world.wind(
      s.position.x,
      roadHeight + 1.2,
      s.position.z,
      s.time,
    );
    const relative = { x: s.velocity.x - wind.x, z: s.velocity.z - wind.z };
    const airFactor =
      0.5 *
      1.225 *
      (input.run ? 0.32 : 0.5) *
      Math.hypot(relative.x, relative.z);
    const dragX = -airFactor * relative.x,
      dragZ = -airFactor * relative.z;
    const crossForce = dragX * right.x + dragZ * right.z;
    const cog = drivetrain.cogs[s.gearIndex]!,
      ratio = drivetrain.chainring / cog;
    const crankSpeed = Math.abs(speed) / BIKE.radius / ratio;
    s.cadence = (crankSpeed * 60) / (2 * Math.PI);
    const cadenceFactor =
      s.cadence < 60
        ? 0.45 + (0.55 * s.cadence) / 60
        : s.cadence > 105
          ? Math.max(0.12, 1 - (s.cadence - 105) / 100)
          : 1;
    const sprint = !!input.sprint && s.stamina > 0.01 && throttle > 0;
    s.stamina = clamp(s.stamina + (sprint ? -0.2 : 0.1) * h, 0, 1);
    const power = (sprint ? 850 : 320) * cadenceFactor * Math.max(0, throttle);
    s.torque = Math.min(90, power / Math.max(crankSpeed, 1));
    s.riderEffort +=
      (Math.max(0, throttle) * (sprint ? 1 : 0.6) - s.riderEffort) * h * 5;
    // Wheel torque = crank torque / speed ratio; preserves P = torque * omega.
    const drive =
      s.chainWear >= 1
        ? 0
        : Math.min(
            ((s.torque / ratio) * drivetrain.efficiency) / BIKE.radius,
            mu[1] * s.normalLoad[1],
          );
    const brake = Math.max(0, -throttle);
    const frontDemand = brake * m * g * 0.7,
      rearDemand = brake * m * g * 0.35;
    const frontBrake = Math.min(frontDemand, mu[0] * s.normalLoad[0]);
    const rearBrake = Math.min(rearDemand, mu[1] * s.normalLoad[1]);
    s.frontLock =
      frontDemand > mu[0] * s.normalLoad[0] + 1 && speed > 3 && s.grounded[0];
    s.skid =
      rearDemand > mu[1] * s.normalLoad[1] + 1 && speed > 1 && s.grounded[1];
    const rearLong = drive - rearBrake * Math.sign(speed || 1),
      frontLong = -frontBrake * Math.sign(speed || 1);
    const lateralMax =
      lateralCapacity(mu[0], s.normalLoad[0], frontLong) +
      lateralCapacity(mu[1], s.normalLoad[1], rearLong);
    const curvature = Math.tan(s.steer) / BIKE.wheelbase;
    // Front/rear slip angles share each wheel's friction circle with drive/braking.
    const yawRate = speed * curvature;
    const frontSlip =
      s.steer -
      Math.atan2(side + yawRate * offsets[0], Math.max(Math.abs(speed), 0.5));
    const rearSlip = -Math.atan2(
      side + yawRate * offsets[1],
      Math.max(Math.abs(speed), 0.5),
    );
    const lateralRequest = m * speed * yawRate - m * side * 6;
    const slipCorrection =
      (Math.tanh(frontSlip * 6) * s.normalLoad[0] * mu[0] +
        Math.tanh(rearSlip * 6) * s.normalLoad[1] * mu[1]) *
      0.08;
    const lateral = clamp(
      lateralRequest + slipCorrection,
      -lateralMax,
      lateralMax,
    );
    const gripUse = Math.abs(m * speed * yawRate) / Math.max(1, lateralMax);
    // Controller transients may briefly consume grip; sustained overload washes out.
    s.slipTime =
      gripUse > 1.1 && Math.abs(speed) > 3
        ? s.slipTime + h
        : Math.max(0, s.slipTime - h * 2);
    if (s.slipTime > 0.3 && grounded) crash('front washout');
    const rolling = grounds.reduce(
      (sum, p, i) => sum + SURFACES[p.surface].rolling * s.normalLoad[i]!,
      0,
    );
    const n = grounds[0].normal;
    const gravityX = grounded ? g * n.y * n.x : 0,
      gravityZ = grounded ? g * n.y * n.z : 0;
    const longitudinal = rearLong + frontLong - rolling * Math.sign(speed);
    const ax =
      (forward.x * longitudinal + right.x * lateral + dragX) / m + gravityX;
    const az =
      (forward.z * longitudinal + right.z * lateral + dragZ) / m + gravityZ;
    s.longitudinalAcceleration = ax * forward.x + az * forward.z;
    s.velocity.x += ax * h;
    s.velocity.z += az * h;
    // Static resistance prevents brake/rolling forces from reversing a stopped bike.
    const newSpeed = s.velocity.x * forward.x + s.velocity.z * forward.z;
    if (
      grounded &&
      Math.abs(speed) < 0.08 &&
      throttle <= 0 &&
      Math.abs(g * Math.sin(roadPitch)) < rolling / m + brake * g &&
      Math.abs(dragX * forward.x + dragZ * forward.z) <
        rolling + frontBrake + rearBrake
    ) {
      s.velocity.x -= newSpeed * forward.x;
      s.velocity.z -= newSpeed * forward.z;
    } else if (brake > 0 && newSpeed * speed < 0) {
      s.velocity.x -= newSpeed * forward.x;
      s.velocity.z -= newSpeed * forward.z;
    }
    s.velocity.y += (load / m - g) * h;
    const before = { ...s.position };
    s.position.x += s.velocity.x * h;
    s.position.z += s.velocity.z * h;
    s.position.y += s.velocity.y * h;
    s.distance += Math.hypot(s.position.x - before.x, s.position.z - before.z);
    // Hard travel stop, sampled at the new position so fast slopes cannot tunnel.
    const support =
      world.sample(s.position.x, s.position.z).height +
      BIKE.height -
      BIKE.travel;
    if (s.position.y < support) {
      s.position.y = support;
      s.velocity.y = Math.max(0, s.velocity.y);
    }
    if (world.solidHit?.(before, s.position)) crash('solid hit');
    if (grounded) {
      s.heading = wrap(
        s.heading +
          yawRate *
            h *
            Math.min(1, lateralMax / Math.max(1, Math.abs(lateralRequest))),
      );
      const leanAcceleration =
        (g * Math.sin(s.lean) - speed * speed * curvature * Math.cos(s.lean)) /
          BIKE.height +
        (crossForce / m / BIKE.height) * 0.12;
      const foot = 1 - lowSpeed;
      s.leanRate +=
        (leanAcceleration * lowSpeed - foot * (30 * s.lean + 10 * s.leanRate)) *
        h;
      s.lean += s.leanRate * h;
      s.pitch += (roadPitch - s.pitch) * (1 - Math.exp(-h * 12));
      if (s.frontLock) s.pitch -= brake * h * 0.55;
      if (Math.abs(s.lean) > Math.min(Math.PI / 2, Math.atan(muMean) + 0.22))
        crash('lean beyond grip');
      if (
        Math.abs(s.lean) < 0.08 &&
        Math.abs(s.pitch - roadPitch) < 0.1 &&
        !s.slipTime &&
        brake === 0
      ) {
        s.safe = { position: { ...s.position }, heading: s.heading };
      }
    } else {
      s.leanRate += steering * h * 0.8;
      s.lean += s.leanRate * h;
      s.pitch += throttle * h * 0.25;
    }
    if (s.preload > 0) {
      s.preload = Math.max(0, s.preload - h);
      if (s.preload === 0 && grounded) {
        s.velocity.y += 2.6;
        s.contactDelay = 0.08;
        s.grounded = [false, false];
        events.push({ type: 'bike:hop' });
      }
    }
    speed = s.velocity.x * forward.x + s.velocity.z * forward.z;
    s.wheelSpin[0] = wrap(
      s.wheelSpin[0] + (s.frontLock ? 0 : speed / BIKE.radius) * h,
    );
    s.wheelSpin[1] = wrap(
      s.wheelSpin[1] + (s.skid ? 0 : speed / BIKE.radius) * h,
    );
    s.crankAngle = wrap(s.crankAngle + (throttle > 0 ? crankSpeed : 0) * h);
  }
  return events;
}

/** FNV-1a over ordered plain state; no timestamps or random sources. */
export function stateHash(state: BikeState): string {
  let hash = 2166136261;
  for (const c of JSON.stringify(state))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
