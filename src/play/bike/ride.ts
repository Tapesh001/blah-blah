import { BIKE } from '../../land/sim/bike';

export interface RoadPoint {
  x: number;
  z: number;
  heading: number;
  dist: number;
  progress: number;
}
/** Small sampling seam; the GameMode adapter supplies the real read-only World. */
export interface RideWorld {
  heightAt(x: number, z: number): number;
  windAt(x: number, z: number): { x: number; z: number };
  roadAt(x: number, z: number): RoadPoint;
  wet: number;
}
export interface RideInput {
  pedal: number;
  brake: number;
  steer: number;
  jump: boolean;
  shift: -1 | 0 | 1;
}
export const COGS = [32, 28, 24, 21, 18, 15, 13, 11] as const;
export interface RideState {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  lean: number;
  pitch: number;
  steer: number;
  verticalSpeed: number;
  grounded: boolean;
  wheelAngle: number;
  crankAngle: number;
  cadence: number;
  gear: number;
  shiftTime: number;
  chainWear: number;
  broken: boolean;
  breakArmed: boolean;
  scriptedBreakUsed: boolean;
  hardStroke: number;
  crashTime: number;
  gripOverload: number;
  jumpHeld: boolean;
  safe: RoadPoint;
  distance: number;
}
export type RideEvent = 'chain-break' | 'crash' | 'respawn' | 'hop';
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clean = (n: number) => (Number.isFinite(n) ? n : 0);

export function createRideState(start: RoadPoint, world: RideWorld): RideState {
  return {
    x: start.x,
    y: world.heightAt(start.x, start.z),
    z: start.z,
    heading: start.heading,
    speed: 0,
    lean: 0,
    pitch: 0,
    steer: 0,
    verticalSpeed: 0,
    grounded: true,
    wheelAngle: 0,
    crankAngle: 0,
    cadence: 0,
    gear: 2,
    shiftTime: 0,
    chainWear: 0,
    broken: false,
    breakArmed: false,
    scriptedBreakUsed: false,
    hardStroke: 0,
    crashTime: 0,
    gripOverload: 0,
    jumpHeld: false,
    safe: { ...start },
    distance: 0,
  };
}

export function repairRide(state: RideState): void {
  state.broken = false;
  state.chainWear = 0;
  state.hardStroke = 0;
  state.breakArmed = false;
  state.speed = Math.min(state.speed, 1.5);
}

/** Fixed substeps keep power, jumps and chain pacing independent of render FPS. */
export function stepRide(
  state: RideState,
  input: RideInput,
  world: RideWorld,
  dt: number,
): RideEvent[] {
  if (!Number.isFinite(dt) || dt <= 0) return [];
  const elapsed = Math.min(dt, 0.1),
    steps = Math.ceil(elapsed / (1 / 120)),
    h = elapsed / steps;
  const events: RideEvent[] = [];
  const pedal = clamp(clean(input.pedal), 0, 1),
    brake = clamp(clean(input.brake), 0, 1),
    steer = clamp(clean(input.steer), -1, 1);
  if (input.shift !== 0 && state.shiftTime <= 0 && !state.broken) {
    const gear = clamp(state.gear + input.shift, 0, COGS.length - 1);
    if (gear !== state.gear) {
      state.gear = gear;
      state.shiftTime = 0.25;
      if (pedal > 0.8 && state.speed < 5)
        state.chainWear = Math.min(1, state.chainWear + 0.025);
    }
  }
  if (
    input.jump &&
    !state.jumpHeld &&
    state.grounded &&
    state.crashTime === 0
  ) {
    state.verticalSpeed = 2.6;
    state.grounded = false;
    events.push('hop');
  }
  state.jumpHeld = input.jump;
  const respawn = () => {
    state.x = state.safe.x;
    state.z = state.safe.z;
    state.y = Math.max(0.3, world.heightAt(state.x, state.z));
    state.heading = state.safe.heading;
    state.speed = 1.2;
    state.verticalSpeed =
      state.lean =
      state.pitch =
      state.steer =
      state.gripOverload =
      state.crashTime =
        0;
    state.grounded = true;
    events.push('respawn');
  };
  const crash = () => {
    if (state.crashTime > 0) return;
    state.crashTime = 1.1;
    events.push('crash');
  };
  for (let step = 0; step < steps; step++) {
    state.shiftTime = Math.max(0, state.shiftTime - h);
    if (state.crashTime > 0) {
      state.crashTime = Math.max(0, state.crashTime - h);
      state.speed *= Math.exp(-5 * h);
      state.lean +=
        (Math.sign(state.lean || 1) * 1.15 - state.lean) *
        (1 - Math.exp(-8 * h));
      if (state.crashTime === 0) respawn();
      continue;
    }
    const road = world.roadAt(state.x, state.z),
      ground = world.heightAt(state.x, state.z);
    if (ground < 0.3) {
      crash();
      respawn();
      continue;
    }
    if (
      road.dist < 3 &&
      ground >= 0.3 &&
      state.grounded &&
      Math.abs(state.lean) < 0.35
    ) {
      const safeHeight = world.heightAt(road.x, road.z);
      if (safeHeight >= 0.3) state.safe = { ...road };
    }
    if (!state.scriptedBreakUsed && road.progress > 0.45) {
      state.breakArmed = true;
      state.chainWear = Math.max(state.chainWear, 0.92);
    }
    if (state.breakArmed && !state.broken) {
      state.hardStroke = pedal > 0.8 ? state.hardStroke + h : 0;
      if (state.hardStroke >= 0.18) {
        state.broken = true;
        state.chainWear = 1;
        state.scriptedBreakUsed = true;
        state.breakArmed = false;
        events.push('chain-break');
      }
    }
    const forwardX = Math.sin(state.heading),
      forwardZ = -Math.cos(state.heading);
    const ahead = world.heightAt(
      state.x + forwardX * 0.54,
      state.z + forwardZ * 0.54,
    );
    const behind = world.heightAt(
      state.x - forwardX * 0.54,
      state.z - forwardZ * 0.54,
    );
    const slope = Math.atan2(ahead - behind, 1.08);
    const wet = clamp(world.wet, 0, 1),
      offRoad = road.dist > 4;
    const mu = offRoad ? 0.52 - wet * 0.22 : 0.92 - wet * 0.3;
    state.steer += (steer * 0.24 - state.steer) * (1 - Math.exp(-h * 7));
    const demanded =
      (state.speed ** 2 * Math.tan(state.steer)) / BIKE.wheelbase;
    const targetLean = clamp(Math.atan(demanded / BIKE.gravity), -0.78, 0.78);
    state.lean += (targetLean - state.lean) * (1 - Math.exp(-h * 7));
    const lateral = BIKE.gravity * Math.tan(state.lean);
    state.gripOverload =
      state.grounded &&
      state.speed > 3 &&
      Math.abs(demanded) > mu * BIKE.gravity * 1.12
        ? state.gripOverload + h
        : Math.max(0, state.gripOverload - 2 * h);
    if (state.gripOverload > 0.45) {
      crash();
      continue;
    }
    // Balanced single-track yaw: the lean supplies the centripetal acceleration.
    const yaw =
      state.speed > 0.8
        ? lateral / state.speed
        : (state.speed * Math.tan(state.steer)) / BIKE.wheelbase;
    if (state.grounded) state.heading = wrap(state.heading + yaw * h);
    const ratio = 38 / COGS[state.gear]!,
      crankSpeed = state.speed / BIKE.radius / ratio;
    state.cadence = (crankSpeed * 60) / (2 * Math.PI);
    const cadencePower =
      state.cadence < 60
        ? 0.45 + (0.55 * state.cadence) / 60
        : state.cadence > 105
          ? Math.max(0.12, 1 - (state.cadence - 105) / 100)
          : 1;
    const torque = Math.min(
      90,
      (pedal * 320 * cadencePower) / Math.max(1, crankSpeed),
    );
    const traction = Math.sqrt(
      Math.max(
        0,
        (mu * BIKE.mass * BIKE.gravity) ** 2 - (lateral * BIKE.mass) ** 2,
      ),
    );
    const drive =
      state.broken || !state.grounded
        ? 0
        : Math.min(
            traction * 0.56,
            (((torque / ratio) * 0.96) / BIKE.radius) *
              (state.shiftTime > 0 ? 0.4 : 1),
          );
    const wind = world.windAt(state.x, state.z),
      rx = state.speed * forwardX - wind.x,
      rz = state.speed * forwardZ - wind.z;
    const dragFactor = 0.5 * 1.225 * 0.5 * Math.hypot(rx, rz);
    const drag = -dragFactor * (rx * forwardX + rz * forwardZ);
    const rolling = state.grounded
      ? (offRoad ? 0.02 : 0.004) * BIKE.mass * BIKE.gravity
      : 0;
    const gravity = state.grounded ? -BIKE.gravity * Math.sin(slope) : 0;
    const braking = state.grounded
      ? brake * mu * BIKE.mass * BIKE.gravity * 0.85
      : 0;
    const acceleration =
      (drive + drag - rolling - braking) / BIKE.mass + gravity;
    state.speed = Math.max(0, state.speed + acceleration * h);
    if (!state.broken) {
      state.chainWear = clamp(
        state.chainWear + Math.max(0, torque - 60) * 0.00012 * h,
        0,
        1,
      );
      if (state.chainWear === 1) {
        state.broken = true;
        events.push('chain-break');
      }
    }
    state.x += Math.sin(state.heading) * state.speed * h;
    state.z -= Math.cos(state.heading) * state.speed * h;
    // Wind can push sideways; tyre grip damps it instead of changing heading.
    const sideWind = wind.x * forwardZ - wind.z * forwardX;
    state.x += forwardZ * sideWind * Math.abs(sideWind) * 0.0009 * h;
    state.z -= forwardX * sideWind * Math.abs(sideWind) * 0.0009 * h;
    state.distance += state.speed * h;
    const newGround = world.heightAt(state.x, state.z);
    if (newGround < 0.3) {
      crash();
      respawn();
      continue;
    }
    if (state.grounded && state.y - newGround > 0.15) state.grounded = false;
    if (!state.grounded) {
      state.verticalSpeed -= BIKE.gravity * h;
      state.y += state.verticalSpeed * h;
      if (state.y <= newGround) {
        const impact = -state.verticalSpeed;
        state.y = newGround;
        state.verticalSpeed = 0;
        state.grounded = true;
        if (impact > 7.1 || Math.abs(state.lean) > 0.7) crash();
      }
    } else state.y = newGround;
    state.pitch += (slope - state.pitch) * (1 - Math.exp(-h * 12));
    state.wheelAngle =
      (state.wheelAngle + (state.speed / BIKE.radius) * h) % (Math.PI * 2);
    if (pedal > 0)
      state.crankAngle =
        (state.crankAngle + Math.max(crankSpeed, 0.5) * h) % (Math.PI * 2);
  }
  return events;
}
