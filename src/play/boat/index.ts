import { Vector3 } from 'three';
import type { GameMode, Hud, World } from '../api';
import { BoatPhysics, DEG, REEFS, type BoatControls } from './physics';
import { createBoatModel } from './model';
import { BoatCamera } from './camera';
import { WinchAudio } from './audio';

export function createBoatMode(): GameMode {
  let physics: BoatPhysics | null = null;
  let model: ReturnType<typeof createBoatModel> | null = null;
  let camera: BoatCamera | null = null;
  let activeWorld: World | null = null;
  let audio = new WinchAudio();
  let finished = false;
  let accumulator = 0;
  let spray = 0;
  let groundedBefore = false;
  const bow = new Vector3(),
    sprayVelocity = new Vector3();
  const controls: BoatControls = {
    steer: 0,
    firstPerson: false,
    haul: false,
    low: false,
    ease: false,
  };

  function cleanup() {
    model?.dispose();
    if (activeWorld) camera?.restore(activeWorld.camera);
    audio.dispose();
    physics = null;
    model = null;
    camera = null;
    activeWorld = null;
  }

  function hudValues(hud: Hud, state: BoatPhysics) {
    hud.set('speed', Math.hypot(state.speed, state.slip));
    hud.set('trim', state.trim);
    hud.set('load', state.force.load);
    hud.set('heel', Math.abs(state.heel) / DEG);
    hud.set('sail', `${Math.round(REEFS[state.reef]! * 100)}%`);
    if (state.grounded) hud.prompt('Grounded — steer toward deep water');
    else if (Math.abs(state.awa) < 35 * DEG)
      hud.prompt('Too close to the wind — bear away');
    else if (
      !camera!.firstPerson &&
      (state.trim < 0.75 || Math.abs(state.heel) > 0.45)
    )
      hud.prompt('V — go to the winch');
    else if (Math.abs(state.heel) > 0.55 || state.force.load > 2500)
      hud.prompt('Ease the rope (R) · S — reef sail');
    else if (state.winch.stalled && controls.haul)
      hud.prompt('Use low gear (Q)');
    else if (
      camera!.firstPerson &&
      state.trim < 0.75 &&
      state.force.alpha > 35 * DEG
    )
      hud.prompt('Ease the rope (R)');
    else if (camera!.firstPerson)
      hud.prompt('E — fast gear · Q — low gear · R — ease · V — chase view');
    else hud.prompt('A/D — rudder · W/S — sail · V — cockpit');
  }

  return {
    enter(world, hud) {
      cleanup();
      physics = new BoatPhysics(world.places.boatStart);
      physics.y = world.oceanHeight(physics.x, physics.z);
      model = createBoatModel();
      world.scene.add(model.root);
      camera = new BoatCamera(world.camera);
      activeWorld = world;
      audio = new WinchAudio();
      accumulator = 0;
      spray = 0;
      groundedBefore = false;
      finished =
        Math.hypot(
          physics.x - world.places.cove.x,
          physics.z - world.places.cove.z,
        ) <= 30;
      model.update(0, physics);
      hud.objective('Sail to the far island');
      hud.toast(
        'V — cockpit and winch · Tack across the wind to reach the cove',
      );
      hudValues(hud, physics);
    },
    update(dt, input, world, hud) {
      if (!physics || !model || !camera || !Number.isFinite(dt) || dt <= 0)
        return;
      const elapsed = Math.min(dt, 1 / 30);
      if (input.pressed('KeyV')) camera.firstPerson = !camera.firstPerson;
      if (input.pressed('KeyW') || input.pressed('ArrowUp')) {
        physics.changeReef(-1);
        hud.toast(`Sail ${Math.round(REEFS[physics.reef]! * 100)}%`);
      }
      if (input.pressed('KeyS') || input.pressed('ArrowDown')) {
        physics.changeReef(1);
        hud.toast(`Sail ${Math.round(REEFS[physics.reef]! * 100)}%`);
      }
      controls.steer = input.steer;
      controls.firstPerson = camera.firstPerson;
      controls.haul = input.down('KeyE');
      controls.low = input.down('KeyQ');
      controls.ease = input.down('KeyR');
      accumulator += elapsed;
      while (accumulator >= 1 / 120 - 1e-10) {
        physics.step(1 / 120, controls, world);
        accumulator -= 1 / 120;
      }
      model.update(elapsed, physics);
      camera.update(elapsed, input, physics, model.root, world.camera);
      audio.update(
        physics.winch.drum,
        controls.firstPerson &&
          (controls.haul || controls.low || controls.ease),
      );
      spray +=
        (Math.max(0, physics.speed - 1) * 0.5 + physics.slam * 2) * elapsed;
      if (spray >= 1) {
        bow.set(0, 0.3, -2.65).applyMatrix4(model.root.matrixWorld);
        sprayVelocity.set(
          Math.sin(physics.heading) * physics.speed * 0.25,
          1.5 + Math.min(3, physics.slam),
          -Math.cos(physics.heading) * physics.speed * 0.25,
        );
        world.burst(
          'spray',
          bow,
          sprayVelocity,
          Math.min(24, 3 + Math.floor(physics.speed * 2)),
        );
        spray %= 1;
      }
      if (physics.grounded && !groundedBefore)
        hud.toast('The bow touched bottom. Turn toward deeper water.');
      groundedBefore = physics.grounded;
      hudValues(hud, physics);
      if (
        Math.hypot(
          physics.x - world.places.cove.x,
          physics.z - world.places.cove.z,
        ) <= 30
      ) {
        if (!finished) hud.toast('Cove reached');
        finished = true;
      }
    },
    done: () => finished,
    exit() {
      cleanup();
    },
  };
}
