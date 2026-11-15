import { evaluate } from '../src/mech/index.ts';
import { pitchRadius } from '../src/mech/sim/chain.ts';
import { exercises } from '../src/mech/sandbox.ts';
import type { MechPlacement } from '../src/mech/sim/types.ts';
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const select = (id: string) => el<HTMLSelectElement>(id);
const input = (id: string) => el<HTMLInputElement>(id);
const board = el<HTMLCanvasElement>('board'),
  ctx = board.getContext('2d')!;
let exercise = exercises[0]!,
  placement: MechPlacement = { parts: [] },
  route: string[] = [],
  history: MechPlacement[] = [];
let result = evaluate(exercise.def, placement),
  running = false,
  hint = 0,
  rotation = 0,
  previous = 0;
const options = (id: string, values: { value: string; text: string }[]) => {
  select(id).replaceChildren(
    ...values.map((v) => {
      const o = document.createElement('option');
      o.value = v.value;
      o.textContent = v.text;
      return o;
    }),
  );
};
options(
  'exercise',
  exercises.map((e, i) => ({ value: String(i), text: e.title })),
);
function load() {
  exercise = exercises[Number(select('exercise').value)] ?? exercises[0]!;
  placement = { parts: [] };
  history = [];
  route = [];
  hint = 0;
  running = false;
  options(
    'part',
    exercise.def.tray.map((p) => ({
      value: p.id,
      text: `${p.id} · ${p.kind}`,
    })),
  );
  options(
    'axle',
    exercise.def.axles.map((a) => ({
      value: a.id,
      text: `Axle ${a.id}${a.id === exercise.def.driver ? ' · driver' : ''}`,
    })),
  );
  options(
    'tier',
    Array.from({ length: exercise.def.tiers }, (_, i) => ({
      value: String(i),
      text: `Tier ${i + 1}${i === 0 ? ' · lower' : ''}`,
    })),
  );
  input('links').value = String(exercise.def.chainLinks);
  input('links').max = String(exercise.def.chainLinks);
  input('tension').value = '0';
  el('hint-text').textContent = '';
  el('goal').textContent = exercise.def.goals
    .map(
      (g) =>
        `Output ${g.axle}: ${g.ratio.toFixed(3)}× ${g.sense > 0 ? 'CW ↻' : 'CCW ↺'}`,
    )
    .join(' / ');
  refresh();
}
function save() {
  history.push(structuredClone(placement));
  if (history.length > 60) history.shift();
  running = false;
}
function refresh(message?: string) {
  result = evaluate(exercise.def, placement);
  el('status').textContent =
    message ??
    (result.seized
      ? 'Seized — conflicting paths.'
      : result.errors.length
        ? result.errors.join(' · ')
        : result.solved
          ? 'Ready to test — all goals connected.'
          : 'Idle — connect the output to the driver.');
  el('route-list').textContent =
    `Route: ${route.length ? route.join(' → ') : 'empty'}`;
  el('tension-value').textContent = `${input('tension').value}%`;
  el('diagnostics').textContent = [
    result.seized ? `Loop: ${result.seizureLoop.join(' → ')}` : '',
    ...result.chains.map(
      (c) =>
        `${c.tension.toUpperCase()} · path ${(c.length * 1000).toFixed(1)} mm · ${c.links} links · slack ${(c.slack * 1000).toFixed(1)} mm · ${exercise.def.chainLinks - c.links} links left`,
    ),
    `Efficiency ${(result.efficiency * 100).toFixed(1)}% · durability ${result.durability.toFixed(2)}×`,
  ]
    .filter(Boolean)
    .join('\n');
  el('gauges').replaceChildren(
    ...exercise.def.axles.map((a) => {
      const out = document.createElement('div');
      out.className = 'gauge';
      const rpm = result.rpm[a.id];
      out.textContent = `${a.id}: ${rpm === null ? 'idle ○' : `${rpm!.toFixed(1)} rpm ${rpm! >= 0 ? '↻' : '↺'}`}`;
      return out;
    }),
  );
  el<HTMLButtonElement>('undo').disabled = history.length === 0;
}
function place() {
  const part = select('part').value,
    axle = select('axle').value,
    tier = Number(select('tier').value);
  const p = exercise.def.tray.find((p) => p.id === part)!;
  const next = structuredClone(placement);
  if (p.kind === 'ratchet') {
    const mounted = next.parts.find((m) => m.axle === axle && m.tier === tier);
    if (!mounted)
      return refresh(
        'Place a gear or sprocket before fitting its ratchet hub.',
      );
    next.ratchets = [
      ...(next.ratchets ?? []).filter(
        (r) => r.mount !== mounted.part && r.part !== part,
      ),
      { part, mount: mounted.part },
    ];
  } else {
    if (next.parts.some((m) => m.part === part))
      return refresh('Lift this part before moving it.');
    if (next.parts.some((m) => m.axle === axle && m.tier === tier))
      return refresh('Occupied — lift the part at this axle and tier first.');
    next.parts.push({ part, axle, tier });
    const e = evaluate(exercise.def, next);
    if (e.errors.some((s) => /Overlap|Stud blocks|Invalid mount/.test(s)))
      return refresh(`Cannot place: ${e.errors.join(' · ')}`);
  }
  save();
  placement = next;
  refresh();
}
el('place').onclick = place;
el('remove').onclick = () => {
  const mounted = placement.parts.find(
    (m) =>
      m.axle === select('axle').value &&
      m.tier === Number(select('tier').value),
  );
  if (!mounted) return refresh('No part at the selected axle and tier.');
  save();
  placement.parts = placement.parts.filter((m) => m !== mounted);
  placement.ratchets = placement.ratchets?.filter(
    (r) => r.mount !== mounted.part,
  );
  placement.chains = placement.chains?.filter(
    (c) => !c.sprockets.includes(mounted.part),
  );
  route = route.filter((p) => p !== mounted.part);
  refresh();
};
function addRoute() {
  const mounted = placement.parts.find(
    (m) =>
      m.axle === select('axle').value &&
      m.tier === Number(select('tier').value),
  );
  if (
    !mounted ||
    exercise.def.tray.find((p) => p.id === mounted.part)?.kind !== 'sprocket'
  )
    return refresh('Choose a mounted sprocket first.');
  if (!route.includes(mounted.part)) route.push(mounted.part);
  refresh();
}
el('route').onclick = addRoute;
el('chain').onclick = () => {
  if (route.length < 2)
    return refresh('Select at least two sprockets in route order.');
  save();
  placement.chains = [
    {
      sprockets: [...route],
      links: Number(input('links').value),
      tensioner: Number(input('tension').value) / 100,
    },
  ];
  refresh();
};
input('tension').onchange = () => {
  if (placement.chains?.length) {
    save();
    placement.chains[0]!.tensioner = Number(input('tension').value) / 100;
  }
  refresh();
};
input('tension').oninput = () => {
  el('tension-value').textContent = `${input('tension').value}%`;
};
el('test').onclick = () => {
  running = true;
  refresh(
    result.solved
      ? 'PASS — ratio, direction and tension meet the goal.'
      : result.seized
        ? 'SEIZED — the highlighted loop cannot turn.'
        : `NOT READY — ${result.errors.join(' · ') || `unmet output ${result.unmetGoals.join(', ')}`}`,
  );
};
el('undo').onclick = () => {
  if (history.length) placement = history.pop()!;
  route = [];
  running = false;
  input('tension').value = String(
    Math.round((placement.chains?.[0]?.tensioner ?? 0) * 100),
  );
  refresh();
};
el('clear').onclick = () => {
  save();
  placement = { parts: [] };
  route = [];
  refresh();
};
el('hint').onclick = () => {
  el('hint-text').textContent =
    exercise.hints[Math.min(hint++, exercise.hints.length - 1)]!;
};
select('exercise').onchange = load;

function transform() {
  const xs = exercise.def.axles.map((a) => a.x),
    ys = exercise.def.axles.map((a) => a.y);
  const minX = Math.min(...xs) - 0.09,
    maxX = Math.max(...xs) + 0.09,
    minY = Math.min(...ys) - 0.09,
    maxY = Math.max(...ys) + 0.09;
  const scale = Math.min(860 / (maxX - minX), 460 / (maxY - minY));
  return {
    scale,
    x: (x: number) => 500 + (x - (minX + maxX) / 2) * scale,
    y: (y: number) => 310 - (y - (minY + maxY) / 2) * scale,
  };
}
board.onclick = (e) => {
  const rect = board.getBoundingClientRect(),
    x = ((e.clientX - rect.left) * 1000) / rect.width,
    y = ((e.clientY - rect.top) * 620) / rect.height,
    t = transform();
  const axle = exercise.def.axles.find(
    (a) => Math.hypot(t.x(a.x) - x, t.y(a.y) - y) < 65,
  );
  if (axle) {
    select('axle').value = axle.id;
    addRoute();
  }
};
function draw(time: number) {
  const dt = previous ? Math.min(0.05, (time - previous) / 1000) : 0;
  previous = time;
  if (running) rotation += dt * 2 * Math.PI;
  const t = transform();
  ctx.clearRect(0, 0, 1000, 620);
  ctx.strokeStyle = '#253743';
  ctx.lineWidth = 1;
  for (let x = 20; x < 1000; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 620);
    ctx.stroke();
  }
  for (let y = 20; y < 620; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1000, y);
    ctx.stroke();
  }
  for (const stud of exercise.def.studs ?? []) {
    ctx.fillStyle = '#a1adb5';
    ctx.beginPath();
    ctx.arc(t.x(stud.x), t.y(stud.y), stud.radius * t.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#18232b';
    ctx.font = 'bold 17px system-ui';
    ctx.fillText('×', t.x(stud.x) - 6, t.y(stud.y) + 6);
  }
  for (const m of [...placement.parts].sort((a, b) => a.tier - b.tier)) {
    const part = exercise.def.tray.find((p) => p.id === m.part)!;
    if (part.kind === 'ratchet') continue;
    const axle = exercise.def.axles.find((a) => a.id === m.axle)!,
      radius = pitchRadius(part.kind, part.teeth) * t.scale;
    const rpm = result.partRpm[m.part] ?? 0,
      seizedPart = result.seizureLoop.includes(`part:${m.part}`);
    const angle = result.seized
      ? Math.sin(time * 0.04) * 0.025
      : (-rotation * rpm) / 60;
    ctx.save();
    ctx.translate(t.x(axle.x), t.y(axle.y));
    ctx.rotate(angle);
    ctx.beginPath();
    for (let i = 0; i < part.teeth * 4; i++) {
      const a = (i * Math.PI * 2) / (part.teeth * 4),
        r = radius * (i % 4 === 1 || i % 4 === 2 ? 1.055 : 0.94);
      const x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = m.tier === 0 ? '#8d744d' : '#91a3ad';
    ctx.strokeStyle = seizedPart ? '#ffba9b' : '#e6d1a7';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#15222b';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.47, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9b387';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius * 0.85, 0);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${part.teeth}T / ${m.tier + 1}`,
      t.x(axle.x),
      t.y(axle.y) - radius - 12,
    );
  }
  for (const chain of result.chains)
    if (chain.path) {
      ctx.strokeStyle = chain.tension === 'ok' ? '#d2dbe0' : '#e8a98d';
      ctx.lineWidth = 5;
      ctx.setLineDash([8, 5]);
      ctx.lineDashOffset = -rotation * 12;
      for (const seg of chain.path.segments) {
        ctx.beginPath();
        ctx.moveTo(t.x(seg.from.x), t.y(seg.from.y));
        ctx.lineTo(t.x(seg.to.x), t.y(seg.to.y));
        ctx.stroke();
      }
      for (const arc of chain.path.arcs) {
        ctx.beginPath();
        ctx.arc(
          t.x(arc.x),
          t.y(arc.y),
          arc.radius * t.scale,
          -arc.start,
          -arc.start - arc.sweep,
          true,
        );
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  for (const a of exercise.def.axles) {
    ctx.fillStyle = a.id === exercise.def.driver ? '#e8c38b' : '#d6e0e8';
    ctx.beginPath();
    ctx.arc(t.x(a.x), t.y(a.y), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${a.id}${a.id === exercise.def.driver ? ' · DRIVER' : ''}`,
      t.x(a.x),
      t.y(a.y) + 90,
    );
  }
  requestAnimationFrame(draw);
}
load();
requestAnimationFrame(draw);
