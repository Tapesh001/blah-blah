import { MathUtils, Vector3 } from 'three';
import type { GameMode, World } from '../api';
import { buildBikeModel } from './model';
import {
  createRideState,
  repairRide,
  stepRide,
  type RideState,
  type RideWorld,
} from './ride';

export interface BikeMode extends GameMode {
  needsBench: boolean;
  repaired(): void;
}

export function createBikeMode(): BikeMode {
  let state: RideState | null = null,
    model: ReturnType<typeof buildBikeModel> | null = null;
  let sampler: RideWorld,
    completed = false,
    firstPerson = false,
    viewBlend = 0;
  let originalFov = 62,
    originalNear = 0.3,
    effectClock = 0,
    lookYaw = 0,
    lookPitch = 0;
  const wind = new Vector3(),
    chase = new Vector3(),
    chaseVelocity = new Vector3(),
    desired = new Vector3();
  const eyes = new Vector3(),
    forward = new Vector3(),
    look = new Vector3(),
    lookGoal = new Vector3();
  const effectPoint = new Vector3(),
    effectVelocity = new Vector3();
  const mode: BikeMode = {
    needsBench: false,
    enter(world, hud) {
      model?.dispose();
      model = buildBikeModel();
      world.scene.add(model.root);
      sampler = {
        heightAt: (x, z) => world.heightAt(x, z),
        windAt: (x, z) => world.windAt(x, z, wind),
        roadAt: (x, z) => world.roadNearest(x, z),
        get wet() {
          return world.wet;
        },
      };
      const start = world.places.bikeStart;
      state = createRideState(
        { ...world.roadNearest(start.x, start.z), ...start },
        sampler,
      );
      mode.needsBench = false;
      completed = false;
      firstPerson = false;
      viewBlend = 0;
      effectClock = lookYaw = lookPitch = 0;
      originalFov = world.camera.fov;
      originalNear = world.camera.near;
      world.camera.near = 0.05;
      world.camera.updateProjectionMatrix();
      model.update(state, 0);
      chase.set(
        state.x - Math.sin(state.heading) * 4.2,
        state.y + 2.5,
        state.z + Math.cos(state.heading) * 4.2,
      );
      chaseVelocity.set(0, 0, 0);
      world.camera.position.copy(chase);
      look.set(state.x, state.y + 1, state.z);
      world.camera.lookAt(look);
      hud.objective('Ride to the harbour');
      hud.prompt(
        'W pedal · S brake · A/D lean · Space hop · Z/X shift · V view',
      );
      hud.set('speed', 0);
      hud.set('gear', state.gear + 1);
      hud.set('chain', 0);
    },
    update(dt, input, world, hud) {
      if (!state || !model || completed || !Number.isFinite(dt) || dt <= 0)
        return;
      hud.objective('Ride to the harbour');
      const step = Math.min(dt, 1 / 30);
      if (input.pressed('KeyV')) firstPerson = !firstPerson;
      lookYaw = MathUtils.clamp(lookYaw + input.lookX, -0.9, 0.9);
      lookPitch = MathUtils.clamp(lookPitch + input.lookY, -0.35, 0.35);
      const events = stepRide(
        state,
        {
          pedal: Math.max(0, input.throttle),
          brake: Math.max(0, -input.throttle),
          steer: input.steer,
          jump: input.down('Space'),
          shift: input.pressed('KeyZ') ? -1 : input.pressed('KeyX') ? 1 : 0,
        },
        sampler,
        step,
      );
      if (state.broken && input.pressed('KeyE') && state.crashTime === 0) {
        mode.needsBench = true;
        state.speed = 0;
      }
      for (const event of events) {
        if (event === 'chain-break')
          hud.toast('The chain has snapped. Coast to a stop and press E.');
        if (event === 'crash') {
          effectPoint.set(state.x, state.y + 0.25, state.z);
          effectVelocity.set(0, 1.8, 0);
          world.burst('sparks', effectPoint, effectVelocity, 18);
          hud.toast('Lost grip — returning to the road');
        }
      }
      viewBlend +=
        ((firstPerson ? 1 : 0) - viewBlend) * (1 - Math.exp(-step * 6));
      model.update(state, viewBlend);
      forward.set(Math.sin(state.heading), 0, -Math.cos(state.heading));
      desired
        .set(state.x, state.y + 2.4, state.z)
        .addScaledVector(forward, -4.2 - state.speed * 0.07);
      desired.y = Math.max(
        desired.y,
        world.heightAt(desired.x, desired.z) + 0.7,
      );
      chaseVelocity
        .addScaledVector(desired.clone().sub(chase), step * 45)
        .multiplyScalar(Math.exp(-step * 11));
      chase.addScaledVector(chaseVelocity, step);
      model.eye.getWorldPosition(eyes);
      world.camera.position.copy(chase).lerp(eyes, viewBlend);
      lookGoal
        .set(state.x, state.y + 1.05, state.z)
        .addScaledVector(forward, 1.5 + state.speed * 0.1);
      desired
        .copy(eyes)
        .add(
          new Vector3(
            Math.sin(state.heading + lookYaw),
            -lookPitch,
            -Math.cos(state.heading + lookYaw),
          ).multiplyScalar(8),
        );
      lookGoal.lerp(desired, viewBlend);
      look.lerp(lookGoal, 1 - Math.exp(-step * 10));
      world.camera.lookAt(look);
      const targetFov = MathUtils.lerp(
        60 + Math.min(18, state.speed * 1.4),
        68 + Math.min(8, state.speed * 0.5),
        viewBlend,
      );
      world.camera.fov +=
        (targetFov - world.camera.fov) * (1 - Math.exp(-step * 4));
      world.camera.updateProjectionMatrix();
      effectClock += step;
      if (
        state.grounded &&
        state.speed > 2 &&
        state.crashTime === 0 &&
        effectClock > 0.09
      ) {
        effectClock = 0;
        effectPoint.set(0, 0.04, 0.54);
        model.root.localToWorld(effectPoint);
        effectVelocity.copy(forward).multiplyScalar(-state.speed * 0.18);
        effectVelocity.y = 0.45;
        world.burst(
          world.wet > 0.25 ? 'spray' : 'dust',
          effectPoint,
          effectVelocity,
          world.wet > 0.25 ? 4 : 2,
        );
      }
      hud.set('speed', state.speed);
      hud.set('gear', state.gear + 1);
      hud.set('chain', state.chainWear);
      hud.prompt(
        state.crashTime > 0
          ? 'Recovering…'
          : state.broken
            ? 'Chain snapped — press E to repair'
            : 'W pedal · S brake · A/D lean · Space hop · Z/X shift · V view',
      );
      completed =
        Math.hypot(
          state.x - world.places.harbour.x,
          state.z - world.places.harbour.z,
        ) <= 12;
      if (completed) hud.prompt('The harbour — ready to sail');
    },
    repaired() {
      if (state) repairRide(state);
      mode.needsBench = false;
    },
    done: () => completed,
    exit(world: World) {
      model?.dispose();
      model = null;
      state = null;
      mode.needsBench = false;
      world.camera.fov = originalFov;
      world.camera.near = originalNear;
      world.camera.updateProjectionMatrix();
    },
  };
  return mode;
}
