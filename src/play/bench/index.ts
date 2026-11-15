import {
  MathUtils,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import type { GameMode, Hud, World } from '../api';
import { benchDefinition, evaluateBoard, type BenchKind } from './rules';
import { buildBenchModel, GEAR_Y } from './model';

export function createBench(kind: 'bike' | 'engine'): GameMode {
  const def = benchDefinition(kind),
    freeAxles = def.axles.filter((a) => !a.fixed);
  let model: ReturnType<typeof buildBenchModel> | null = null;
  let placement: Record<string, string | undefined> = {},
    selected = def.tray[0]!.id,
    selectedAxle = 0;
  let dragging: {
    id: string;
    previous: string | null;
    offset: Vector3;
  } | null = null;
  let tension = 0.25,
    angle = 0,
    testTime = 0,
    completed = false,
    time = 0,
    shake = 0,
    hint = 0;
  let savedFov = 62,
    savedNear = 0.3;
  const savedPosition = new Vector3(),
    savedRotation = new Quaternion(),
    anchor = new Vector3(),
    cameraGoal = new Vector3(),
    lookAt = new Vector3();
  const raycaster = new Raycaster(),
    ndc = new Vector2(),
    plane = new Plane(new Vector3(0, 1, 0)),
    hitPoint = new Vector3(),
    localPoint = new Vector3();
  const sparkPosition = new Vector3(),
    sparkVelocity = new Vector3(0, 1, 0);
  const hints: Record<BenchKind, string[]> = {
    bike: [
      'The idler reverses rotation twice. Its size must fit both centre distances.',
      'Use the 24-tooth gear on the middle peg.',
      'Fit 24T, set tension to 55–72% with A/D, then hold Space for one second.',
    ],
    engine: [
      'Three gear meshes reverse the drive. The 40T Keystone must turn at half the driver speed.',
      'The left free peg takes 24T; the right free peg takes 32T.',
      'Fit 24T on idler A, 32T on idler B, then hold Space for one second.',
    ],
  };
  function clash(world: World, hud: Hud, message: string) {
    shake = 0.3;
    testTime = 0;
    sparkPosition.copy(anchor).add(new Vector3(0, GEAR_Y, 0));
    world.burst('sparks', sparkPosition, sparkVelocity, 12);
    hud.toast(message);
  }
  function place(id: string, axle: string, world: World, hud: Hud): boolean {
    const next = { ...placement };
    for (const key of Object.keys(next)) if (next[key] === id) delete next[key];
    if (next[axle]) {
      clash(world, hud, 'That peg is occupied. Lift its gear first.');
      return false;
    }
    next[axle] = id;
    const result = evaluateBoard(def, next);
    if (!result.legal) {
      clash(world, hud, 'The gears clash — choose a smaller gear.');
      return false;
    }
    placement = next;
    testTime = 0;
    return true;
  }
  const pointerPoint = (world: World, x: number, y: number) => {
    if (!model) return false;
    world.camera.updateMatrixWorld(true);
    model.root.updateMatrixWorld(true);
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, world.camera);
    plane.constant = -(model.root.position.y + GEAR_Y);
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return false;
    localPoint.copy(hitPoint);
    model.root.worldToLocal(localPoint);
    return true;
  };
  return {
    enter(world, hud) {
      model?.dispose();
      model = buildBenchModel(def);
      placement = {};
      dragging = null;
      selected = def.tray[0]!.id;
      selectedAxle = 0;
      tension = 0.25;
      angle = testTime = time = shake = hint = 0;
      completed = false;
      savedPosition.copy(world.camera.position);
      savedRotation.copy(world.camera.quaternion);
      savedFov = world.camera.fov;
      savedNear = world.camera.near;
      world.camera.getWorldDirection(lookAt);
      lookAt.y = 0;
      lookAt.normalize();
      anchor.copy(world.camera.position).addScaledVector(lookAt, 2.0);
      anchor.y = Math.max(0.4, world.heightAt(anchor.x, anchor.z));
      model.root.position.copy(anchor);
      world.scene.add(model.root);
      cameraGoal.copy(anchor).add(new Vector3(0, 2.52, 1.25));
      lookAt.copy(anchor).add(new Vector3(0, 0.97, 0));
      world.camera.position.copy(cameraGoal);
      world.camera.lookAt(lookAt);
      world.camera.fov = 42;
      world.camera.near = 0.03;
      world.camera.updateProjectionMatrix();
      world.camera.updateMatrixWorld(true);
      model.root.updateMatrixWorld(true);
      model.arrange(placement, null);
      hud.objective(
        kind === 'bike'
          ? 'Repair the bicycle chain'
          : 'Restore the Keystone engine',
      );
      hud.prompt('Drag gears to pegs · Hold Space to test · H for a hint');
      hud.set('speed', '—');
      hud.set('gear', 'bench');
      hud.set(
        'goal',
        kind === 'bike' ? '2.5× · same direction' : '0.5× · opposite direction',
      );
      hud.set('ratio', 'idle');
      if (kind === 'bike') hud.set('tension', tension);
      hud.toast(
        'Mouse drag, or 1–4 select · Tab choose peg · Enter place · Backspace lift',
      );
    },
    update(dt, input, world, hud) {
      if (!model || completed || !Number.isFinite(dt) || dt <= 0) return;
      const step = Math.min(dt, 1 / 30);
      time += step;
      shake = Math.max(0, shake - step);
      model.root.position.copy(anchor);
      if (shake > 0) {
        model.root.position.x += Math.sin(time * 100) * shake * 0.025;
        model.root.position.z += Math.sin(time * 83) * shake * 0.018;
      }
      if (input.pressed('KeyH')) hud.toast(hints[kind][Math.min(hint++, 2)]!);
      for (let i = 0; i < def.tray.length; i++)
        if (input.pressed(`Digit${i + 1}`)) selected = def.tray[i]!.id;
      if (input.pressed('Tab'))
        selectedAxle = (selectedAxle + 1) % freeAxles.length;
      if (input.pressed('Enter') && !dragging)
        place(selected, freeAxles[selectedAxle]!.id, world, hud);
      if (input.pressed('Backspace') && !dragging) {
        delete placement[freeAxles[selectedAxle]!.id];
        testTime = 0;
      }
      if (kind === 'bike') {
        const old = tension;
        tension = MathUtils.clamp(tension + input.steer * step * 0.34, 0, 1);
        if (old !== tension) testTime = 0;
      }
      const hasPointer = pointerPoint(world, input.pointer.x, input.pointer.y);
      if (input.pointer.pressed && hasPointer && !dragging) {
        const picked = raycaster.intersectObjects(model.picks, false)[0];
        const id = picked?.object.userData.partId as string | undefined;
        if (id) {
          const part = model.parts.get(id)!;
          selected = id;
          const previous =
            Object.keys(placement).find((key) => placement[key] === id) ?? null;
          if (previous) delete placement[previous];
          dragging = {
            id,
            previous,
            offset: part.group.position.clone().sub(localPoint),
          };
          testTime = 0;
        }
      }
      if (dragging && hasPointer) {
        const part = model.parts.get(dragging.id)!;
        part.group.position.copy(localPoint).add(dragging.offset);
        part.group.position.y = GEAR_Y + 0.09;
        const closest = [...freeAxles].sort(
          (a, b) =>
            Math.hypot(
              a.x - part.group.position.x,
              a.z - part.group.position.z,
            ) -
            Math.hypot(
              b.x - part.group.position.x,
              b.z - part.group.position.z,
            ),
        )[0]!;
        const near =
          Math.hypot(
            closest.x - part.group.position.x,
            closest.z - part.group.position.z,
          ) < 0.115;
        const candidate = { ...placement, [closest.id]: dragging.id };
        model.preview(
          near ? closest.id : null,
          !placement[closest.id] && evaluateBoard(def, candidate).legal,
        );
        if (input.pointer.released || !input.pointer.down) {
          const drag = dragging;
          dragging = null;
          model.preview(null, true);
          if (near && !place(drag.id, closest.id, world, hud) && drag.previous)
            placement[drag.previous] = drag.id;
        }
      } else if (dragging && (input.pointer.released || !input.pointer.down)) {
        if (dragging.previous) placement[dragging.previous] = dragging.id;
        dragging = null;
        model.preview(null, true);
      }
      model.arrange(placement, dragging?.id ?? null);
      const result = evaluateBoard(def, placement),
        tensionOK =
          kind === 'engine' ||
          (tension >= 0.55 - 1e-8 && tension <= 0.72 + 1e-8);
      const testing = input.down('Space') && !dragging;
      if (testing) angle += step * Math.PI * 1.4;
      testTime = testing && result.solved && tensionOK ? testTime + step : 0;
      model.turn(angle, result, tension, selected);
      if (!dragging) model.preview(freeAxles[selectedAxle]!.id, true);
      hud.set(
        'ratio',
        result.ratio === null
          ? 'idle'
          : `${Math.abs(result.ratio).toFixed(2)}× · ${result.ratio > 0 ? 'same' : 'opposite'}`,
      );
      if (kind === 'bike') hud.set('tension', tension);
      hud.set(
        'selected',
        `${model.parts.get(selected)!.teeth}T → ${freeAxles[selectedAxle]!.id}`,
      );
      if (!result.solved)
        hud.prompt(
          'Connect driver to output · Drag a gear onto a peg · H hint',
        );
      else if (!tensionOK)
        hud.prompt(
          `Ratio correct. A/D: set tension to 55–72% (now ${Math.round(tension * 100)}%).`,
        );
      else
        hud.prompt(
          testing
            ? `Testing… ${Math.min(100, Math.round(testTime * 100))}%`
            : 'Ready — hold Space for one second to test',
        );
      if (testTime >= 1) {
        completed = true;
        hud.prompt(
          kind === 'bike'
            ? 'Chain repaired — ready to ride'
            : 'The Keystone turns. Engine restored.',
        );
        hud.toast('Mechanism passed');
      }
    },
    done: () => completed,
    exit(world) {
      model?.dispose();
      model = null;
      dragging = null;
      world.camera.position.copy(savedPosition);
      world.camera.quaternion.copy(savedRotation);
      world.camera.fov = savedFov;
      world.camera.near = savedNear;
      world.camera.updateProjectionMatrix();
    },
  };
}
