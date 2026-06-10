/** Swiss / zone matches: 6 alternating bans → one decider (Bo1). */
export type MapVetoFormat = 'bo1' | 'bo3' | 'bo5';

export type MapVetoStepKind = 'ban' | 'pick' | 'side_pick';

export type MapVetoStep = {
  readonly kind: MapVetoStepKind;
  readonly side: 'team_a' | 'team_b';
};

const BO1_STEPS: readonly MapVetoStep[] = Array.from({ length: 6 }, (_, i) => ({
  kind: 'ban' as const,
  side: i % 2 === 0 ? 'team_a' : 'team_b',
}));

/** Playoff Bo3: ban, ban, pick+side, pick+side, ban, ban → decider. */
const BO3_STEPS: readonly MapVetoStep[] = [
  { kind: 'ban', side: 'team_a' },
  { kind: 'ban', side: 'team_b' },
  { kind: 'pick', side: 'team_a' },
  { kind: 'side_pick', side: 'team_b' },
  { kind: 'pick', side: 'team_b' },
  { kind: 'side_pick', side: 'team_a' },
  { kind: 'ban', side: 'team_a' },
  { kind: 'ban', side: 'team_b' },
];

/**
 * Lobby rentals Bo5: each captain picks twice (with the other captain choosing the
 * starting side for each), then the remaining map is the decider (map 5).
 * No bans — the pool only has 7 maps, so 4 picks + 2 pre-bans would leave 1,
 * but in the lobby Bo5 flow we rely on the 4 picks + decider = 5 maps.
 */
const BO5_STEPS: readonly MapVetoStep[] = [
  { kind: 'ban', side: 'team_a' },
  { kind: 'ban', side: 'team_b' },
  { kind: 'pick', side: 'team_a' },
  { kind: 'side_pick', side: 'team_b' },
  { kind: 'pick', side: 'team_b' },
  { kind: 'side_pick', side: 'team_a' },
  { kind: 'pick', side: 'team_a' },
  { kind: 'side_pick', side: 'team_b' },
  { kind: 'pick', side: 'team_b' },
  { kind: 'side_pick', side: 'team_a' },
];

/** Playoff-style codes use Bo3 veto; everything else uses Bo1. */
export function mapVetoFormatFromMatchCode(code: string | null | undefined): MapVetoFormat {
  if (code && /^playoff/i.test(code.trim())) {
    return 'bo3';
  }
  return 'bo1';
}

export function mapVetoStepsForFormat(format: MapVetoFormat): readonly MapVetoStep[] {
  if (format === 'bo3') {
    return BO3_STEPS;
  }
  if (format === 'bo5') {
    return BO5_STEPS;
  }
  return BO1_STEPS;
}

export function totalMapVetoSteps(format: MapVetoFormat): number {
  return mapVetoStepsForFormat(format).length;
}
