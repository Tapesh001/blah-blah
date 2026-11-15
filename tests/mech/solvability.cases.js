import { test } from 'vitest';
import assert from 'node:assert/strict';
import { evaluate } from '../../src/mech/index.ts';
import { exercises } from '../../src/mech/sandbox.ts';

/** Enumerate physical assignments without consulting the authored solution. */
function solve(def, inventory = [], requireSpare = false) {
  const catalog = [...def.tray, ...inventory].filter(
    (p) => p.kind !== 'ratchet',
  );
  const count = def.tray.filter((p) => p.kind !== 'ratchet').length;
  const slots = def.axles.flatMap((a) =>
    Array.from({ length: def.tiers }, (_, tier) => ({ axle: a.id, tier })),
  );
  function visit(parts, usedSlots, usedParts) {
    if (parts.length === count) {
      if (
        requireSpare &&
        !parts.some((m) => inventory.some((p) => p.id === m.part))
      )
        return null;
      const p = { parts, inventory };
      const sprockets = parts.filter(
        (m) => catalog.find((p) => p.id === m.part).kind === 'sprocket',
      );
      if (!sprockets.length) return evaluate(def, p).solved ? p : null;
      // Enumerate link count and tension; route order follows the axle perimeter.
      const order = [...sprockets]
        .sort((a, b) => a.axle.localeCompare(b.axle))
        .map((m) => m.part);
      for (let links = 1; links <= def.chainLinks; links++)
        for (let dial = 0; dial <= 10; dial++) {
          const candidate = {
            ...p,
            chains: [{ sprockets: order, links, tensioner: dial / 10 }],
          };
          if (evaluate(def, candidate).solved) return candidate;
        }
      return null;
    }
    for (let pi = 0; pi < catalog.length; pi++)
      if (!usedParts.has(pi)) {
        for (let si = 0; si < slots.length; si++)
          if (!usedSlots.has(si)) {
            const next = [...parts, { part: catalog[pi].id, ...slots[si] }];
            const e = evaluate(def, { parts: next, inventory });
            if (!e.valid) continue;
            const found = visit(
              next,
              new Set([...usedSlots, si]),
              new Set([...usedParts, pi]),
            );
            if (found) return found;
          }
      }
    return null;
  }
  return visit([], new Set(), new Set());
}
for (const exercise of exercises) {
  test(`${exercise.def.id}: authored example meets all goals`, () => {
    const e = evaluate(exercise.def, exercise.solution);
    assert.equal(e.solved, true, JSON.stringify(e.errors));
  });
  test(`${exercise.def.id}: independent search finds a tray-only solution`, () => {
    const solution = solve(exercise.def);
    assert.ok(solution);
    assert.equal(evaluate(exercise.def, solution).solved, true);
  });
  test(`${exercise.def.id}: inventory enables a distinct physical build`, () => {
    const first = exercise.def.tray.find((p) => p.kind !== 'ratchet');
    const inventory = [{ ...first, id: 'inventory-spare' }];
    const solution = solve(exercise.def, inventory, true);
    assert.ok(solution);
    assert.ok(solution.parts.some((m) => m.part === 'inventory-spare'));
    assert.equal(evaluate(exercise.def, solution).solved, true);
  });
}
