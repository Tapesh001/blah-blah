import { Vector3 } from 'three';
import type { World } from '../api';

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export const DEG = Math.PI / 180;
export const REEFS = [1, 0.7, 0.45] as const;
export interface SailForce {
  drive: number;
  side: number;
  load: number;
  boom: number;
  alpha: number;
  luff: number;
}

/** Wind components are velocity toward bow/right. awa is the incoming angle. */
export function sailForce(
  windForward: number,
  windRight: number,
  sheet: number,
  area: number,
): SailForce {
  const awa = Math.atan2(-windRight, -windForward);
  const angle = Math.abs(awa);
  const boom = Math.min(angle, (5 + clamp(sheet, 0, 1) * 80) * DEG);
  const alpha = angle - boom;
  const degrees = alpha / DEG;
  let lift = 0;
  if (degrees > 4 && degrees <= 25) lift = (1.3 * (degrees - 4)) / 21;
  else if (degrees <= 35 && degrees > 25) lift = 1.3;
  else if (degrees > 35 && degrees < 90) lift = (1.3 * (90 - degrees)) / 55;
  const drag = 0.05 + 1.1 * Math.sin(alpha) ** 2;
  const pressure = 0.5 * 1.225 * (windForward ** 2 + windRight ** 2) * area;
  const sideSign = Math.sign(awa) || 1;
  const drive = pressure * (lift * Math.sin(angle) - drag * Math.cos(angle));
  const side =
    pressure * (-sideSign * (lift * Math.cos(angle) + drag * Math.sin(angle)));
  return {
    drive,
    side,
    load: Math.hypot(drive, side) * 0.6,
    boom: -sideSign * boom,
    alpha,
    luff: 1 - clamp(degrees / 4, 0, 1),
  };
}

export interface BoatControls {
  steer: number;
  firstPerson: boolean;
  haul: boolean;
  low: boolean;
  ease: boolean;
}

export class Winch {
  sheet = 0.45;
  handle = 0;
  drum = 0;
  angularSpeed = 0;
  stalled = false;
  private easeTime = 0;

  update(dt: number, load: number, input: BoatControls) {
    this.stalled = false;
    let target = 0;
    if (input.firstPerson && input.ease) {
      this.easeTime += dt;
      const payout = Math.min(0.45, 0.07 + this.easeTime * 0.14) * dt;
      const length = Math.min(payout, 1 - this.sheet);
      this.sheet += length;
      this.drum -= (length * 2.4) / 0.04;
    } else {
      this.easeTime = 0;
      if (input.firstPerson && (input.low || input.haul) && this.sheet > 0) {
        const limit = input.low ? 2500 : 700;
        this.stalled = load >= limit;
        target = this.stalled
          ? 0
          : (input.low ? -1 : 1) * 7 * Math.sqrt(1 - load / limit);
      }
    }
    this.angularSpeed +=
      (target - this.angularSpeed) * (1 - Math.exp(-dt * 16));
    // A pawl holds the load immediately on release, stall or external view.
    if (target === 0) this.angularSpeed = 0;
    const turn = this.angularSpeed * dt;
    this.handle += turn;
    if (turn !== 0) {
      const drumTurn = Math.abs(turn) / (turn < 0 ? 6 : 1);
      const hauled = Math.min(this.sheet, (drumTurn * 0.04) / 2.4);
      this.sheet -= hauled;
      this.drum += (hauled * 2.4) / 0.04;
    }
  }
}

/** Plain simulation state; scene objects live in the mode/view. */
export class BoatPhysics {
  x: number;
  z: number;
  heading: number;
  y = 0;
  pitch = 0;
  waveRoll = 0;
  speed = 0.8;
  slip = 0;
  heel = 0;
  heelVelocity = 0;
  rudder = 0;
  reef = 0;
  awa = 0;
  apparentForward = 0;
  apparentRight = 0;
  trim = 0;
  grounded = false;
  slam = 0;
  force: SailForce = { drive: 0, side: 0, load: 0, boom: 0, alpha: 0, luff: 1 };
  readonly winch = new Winch();
  private wind = new Vector3();

  constructor(start: { x: number; z: number; heading: number }) {
    this.x = start.x;
    this.z = start.z;
    this.heading = start.heading;
  }

  changeReef(change: number) {
    this.reef = clamp(this.reef + change, 0, 2);
  }

  step(dt: number, input: BoatControls, world: World) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const sin = Math.sin(this.heading),
      cos = Math.cos(this.heading);
    world.windAt(this.x, this.z, this.wind);
    this.apparentForward = this.wind.x * sin - this.wind.z * cos - this.speed;
    this.apparentRight = this.wind.x * cos + this.wind.z * sin - this.slip;
    this.awa = Math.atan2(-this.apparentRight, -this.apparentForward);
    const area = 9.5 * REEFS[this.reef]! * Math.max(0.2, Math.cos(this.heel));
    this.force = sailForce(
      this.apparentForward,
      this.apparentRight,
      this.winch.sheet,
      area,
    );
    this.winch.update(dt, this.force.load, input);
    this.force = sailForce(
      this.apparentForward,
      this.apparentRight,
      this.winch.sheet,
      area,
    );
    let best = 0;
    for (let i = 0; i <= 40; i++) {
      best = Math.max(
        best,
        sailForce(this.apparentForward, this.apparentRight, i / 40, area).drive,
      );
    }
    this.trim = best > 1 ? clamp(this.force.drive / best, 0, 1) : 0;
    this.speed +=
      ((this.force.drive -
        18 * this.speed * Math.abs(this.speed) -
        9 * this.speed) /
        500) *
      dt;
    this.slip +=
      ((this.force.side -
        1400 * this.slip * Math.abs(this.slip) -
        220 * this.slip) /
        500) *
      dt;
    this.rudder +=
      (clamp(input.steer, -1, 1) - this.rudder) * (1 - Math.exp(-dt * 5));
    this.heading += this.rudder * (0.16 + Math.abs(this.speed) * 0.075) * dt;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    const targetHeel = Math.atan2(this.force.side * 2.2, 500 * 9.81 * 0.65);
    this.heelVelocity +=
      ((targetHeel - this.heel) * 10 - this.heelVelocity * 5) * dt;
    this.heel += this.heelVelocity * dt;
    const vx = sin * this.speed + cos * this.slip;
    const vz = -cos * this.speed + sin * this.slip;
    const nextX = this.x + vx * dt,
      nextZ = this.z + vz * dt;
    this.grounded = world.heightAt(nextX + sin * 2.5, nextZ - cos * 2.5) > -0.4;
    if (this.grounded) {
      this.speed = 0;
      this.slip = 0;
      this.x -= sin * dt * 1.2;
      this.z += cos * dt * 1.2;
    } else {
      this.x = nextX;
      this.z = nextZ;
    }
    const bow = world.oceanHeight(this.x + sin * 2.4, this.z - cos * 2.4);
    const stern = world.oceanHeight(this.x - sin * 2.4, this.z + cos * 2.4);
    const port = world.oceanHeight(this.x - cos * 0.9, this.z - sin * 0.9);
    const starboard = world.oceanHeight(this.x + cos * 0.9, this.z + sin * 0.9);
    const height = (bow + stern + port + starboard) / 4;
    this.slam = Math.max(0, (height - this.y) * 7 - 1.3);
    const follow = 1 - Math.exp(-dt * 7);
    this.y += (height - this.y) * follow;
    this.pitch += (Math.atan2(bow - stern, 4.8) - this.pitch) * follow;
    this.waveRoll +=
      (Math.atan2(starboard - port, 1.8) - this.waveRoll) * follow;
  }
}
