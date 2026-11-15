/** Small M0 rule exercises, not the chapter puzzles or shared Bench contract. */
import { chainPath, CHAIN_PITCH, pitchRadius } from './sim';
import type { MechPlacement, MechPuzzleDef } from './sim';
export interface Exercise {
  def: MechPuzzleDef;
  title: string;
  hints: string[];
  solution: MechPlacement;
}
const gear = (id: string, teeth: number) => ({
  id,
  kind: 'gear' as const,
  teeth,
});
const sprocket = (id: string, teeth: number) => ({
  id,
  kind: 'sprocket' as const,
  teeth,
});
const mount = (part: string, axle: string, tier = 0) => ({ part, axle, tier });
const foundation = {
  context: 'engine' as const,
  driver: 'A',
  driverRpm: 60,
  chainLinks: 120,
  tiers: 2,
  tension: { min: 0.005, max: 0.015, takeUp: 0.05 },
};
const mesh: Exercise = {
  title: '01 / A single mesh',
  def: {
    ...foundation,
    id: 'm0-mesh',
    axles: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 0.075, y: 0 },
    ],
    tray: [gear('20T', 20), gear('40T', 40)],
    goals: [{ axle: 'B', ratio: 0.5, sense: -1, tolerance: 0.001 }],
  },
  hints: [
    'A mesh reverses rotation. The larger gear turns slower.',
    'The driver is A. Put the smaller gear there, on tier 1.',
    '20T on A and 40T on B, both on tier 1. Press Test.',
  ],
  solution: { parts: [mount('20T', 'A'), mount('40T', 'B')] },
};
const compound: Exercise = {
  title: '02 / A compound shaft',
  def: {
    ...foundation,
    id: 'm0-compound',
    axles: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 0.075, y: 0 },
      { id: 'C', x: 0.125, y: 0 },
    ],
    tray: [gear('20T', 20), gear('40T', 40), gear('10T', 10), gear('30T', 30)],
    goals: [{ axle: 'C', ratio: 1 / 6, sense: 1, tolerance: 0.001 }],
  },
  hints: [
    'Two reversals restore the original direction. Stack two parts on the middle axle.',
    'A drives B on tier 1; B drives C on tier 2.',
    '20T A/1, 40T B/1, 10T B/2, 30T C/2.',
  ],
  solution: {
    parts: [
      mount('20T', 'A'),
      mount('40T', 'B'),
      mount('10T', 'B', 1),
      mount('30T', 'C', 1),
    ],
  },
};
function chainExercise(idler: boolean): Exercise {
  const def: MechPuzzleDef = {
    ...foundation,
    id: idler ? 'm0-idler' : 'm0-chain',
    context: 'bike',
    tiers: 1,
    axles: [
      { id: 'A', x: -0.16, y: 0 },
      { id: 'B', x: 0.16, y: 0 },
      ...(idler ? [{ id: 'C', x: 0, y: -0.16 }] : []),
    ],
    tray: [
      sprocket('24T', 24),
      sprocket('16T', 16),
      ...(idler ? [sprocket('12T', 12)] : []),
    ],
    goals: [{ axle: 'B', ratio: 1.5, sense: 1, tolerance: 0.001 }],
    studs: idler ? [{ x: 0, y: -0.04, radius: 0.012 }] : [],
  };
  const parts = [
    mount('24T', 'A'),
    mount('16T', 'B'),
    ...(idler ? [mount('12T', 'C')] : []),
  ];
  const length = chainPath(
    parts.map((p, i) => ({
      ...def.axles[i]!,
      radius: pitchRadius('sprocket', [24, 16, 12][i]!),
    })),
  )!.length;
  def.chainLinks = Math.ceil((length + 0.025) / CHAIN_PITCH);
  const tensioner =
    (def.chainLinks * CHAIN_PITCH - length - 0.01) / def.tension.takeUp;
  return {
    def,
    title: idler ? '04 / Clear the stud' : '03 / Chain & tension',
    hints: [
      'Chains preserve direction. Leave a little slack, then take it up with the dial.',
      idler
        ? 'The lower chain span hits the stud. Route around C.'
        : 'Put 24T on A and 16T on B; then select them in route order.',
      `24T A/1, 16T B/1${idler ? ', 12T C/1' : ''}. Route A → B${idler ? ' → C' : ''}, fit ${def.chainLinks} links, tension about ${Math.round(tensioner * 100)}%.`,
    ],
    solution: {
      parts,
      chains: [
        {
          sprockets: parts.map((p) => p.part),
          links: def.chainLinks,
          tensioner,
        },
      ],
    },
  };
}
const ratchet: Exercise = {
  title: '05 / One-way hub',
  def: {
    ...mesh.def,
    id: 'm0-ratchet',
    context: 'winch',
    tray: [
      ...mesh.def.tray,
      { id: 'CW hub', kind: 'ratchet', direction: 1 },
      { id: 'CCW hub', kind: 'ratchet', direction: -1 },
    ],
  },
  hints: [
    'The output gear turns counter-clockwise. A matching hub transmits that direction.',
    'Mount the two gears first. Select the output axle before fitting a hub.',
    '20T A/1, 40T B/1, then CCW hub B/1. The CW hub freewheels.',
  ],
  solution: { ...mesh.solution, ratchets: [{ part: 'CCW hub', mount: '40T' }] },
};
export const exercises: Exercise[] = [
  mesh,
  compound,
  chainExercise(false),
  chainExercise(true),
  ratchet,
];
