/**
 * Full round-robin for a Swiss group: each team plays every other team once.
 * Odd n ⇒ n rounds, one bye per round; even n ⇒ n−1 rounds, no bye.
 *
 * Odd roster sizes use a circle method with a synthetic bye (same as classic
 * round-robin scheduling).
 */

export type ZoneRoundPlan = {
  readonly roundNumber: number;
  readonly pairings: readonly { readonly teamAId: string; readonly teamBId: string }[];
  readonly byeTeamId: string | null;
};

const BYE = '__RR_BYE__';

function planEven(teamIds: readonly string[]): ZoneRoundPlan[] {
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) {
    throw new Error('planEven expects even n ≥ 2');
  }
  const arr = [...teamIds];
  const rounds = n - 1;
  const half = n / 2;
  const out: ZoneRoundPlan[] = [];
  for (let r = 0; r < rounds; r++) {
    const pairings: { teamAId: string; teamBId: string }[] = [];
    for (let i = 0; i < half; i++) {
      pairings.push({
        teamAId: arr[i]!,
        teamBId: arr[n - 1 - i]!,
      });
    }
    out.push({ roundNumber: r + 1, pairings, byeTeamId: null });
    const head = arr[0]!;
    const tail = arr.slice(1);
    const last = tail.pop()!;
    arr.length = 0;
    arr.push(head, last, ...tail);
  }
  return out;
}

function planOddGeneric(teamIds: readonly string[]): ZoneRoundPlan[] {
  const n0 = teamIds.length;
  const working = [...teamIds, BYE];
  const n = working.length;
  const rounds = n - 1;
  const half = n / 2;
  const arr = [...working];
  const out: ZoneRoundPlan[] = [];
  for (let r = 0; r < rounds; r++) {
    const pairings: { teamAId: string; teamBId: string }[] = [];
    let byeTeamId: string | null = null;
    for (let i = 0; i < half; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      if (a === BYE) {
        byeTeamId = b;
      } else if (b === BYE) {
        byeTeamId = a;
      } else {
        pairings.push({ teamAId: a, teamBId: b });
      }
    }
    out.push({ roundNumber: r + 1, pairings, byeTeamId });
    const head = arr[0]!;
    const tail = arr.slice(1);
    const last = tail.pop()!;
    arr.length = 0;
    arr.push(head, last, ...tail);
  }
  return out;
}

/** Build all rounds from ordered roster (slot order). */
export function buildZoneRoundRobin(teamIds: readonly string[]): ZoneRoundPlan[] {
  const n = teamIds.length;
  if (n < 2) {
    return [];
  }
  if (n % 2 === 0) {
    return planEven(teamIds);
  }
  return planOddGeneric(teamIds);
}
