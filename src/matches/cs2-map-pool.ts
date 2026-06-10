/** Active-duty style 7-map pool for veto UI (display names = DB values). */
export const CS2_COMP_MAP_POOL = [
  'Ancient',
  'Anubis',
  'Dust2',
  'Inferno',
  'Mirage',
  'Nuke',
  'Overpass',
] as const;

export type Cs2CompMapId = (typeof CS2_COMP_MAP_POOL)[number];

export function canonicalCompMapName(input: string): Cs2CompMapId | null {
  const t = input.trim().toLowerCase();
  const hit = CS2_COMP_MAP_POOL.find((m) => m.toLowerCase() === t);
  return hit ?? null;
}

/** Maps no longer in the pool (bans + picks) must leave exactly one decider. */
export function remainingMapAfterRemoved(removed: readonly string[]): Cs2CompMapId | null {
  const gone = new Set(removed.map((b) => b.toLowerCase()));
  const left = CS2_COMP_MAP_POOL.filter((m) => !gone.has(m.toLowerCase()));
  return left.length === 1 ? left[0]! : null;
}

export function remainingMapAfterBans(bans: readonly string[]): Cs2CompMapId | null {
  return remainingMapAfterRemoved(bans);
}

/** CS2 dedicated server / launch parameter map id (e.g. `de_overpass`). */
const POOL_DISPLAY_TO_LAUNCH: Readonly<Record<Cs2CompMapId, string>> = {
  Ancient: 'de_ancient',
  Anubis: 'de_anubis',
  Dust2: 'de_dust2',
  Inferno: 'de_inferno',
  Mirage: 'de_mirage',
  Nuke: 'de_nuke',
  Overpass: 'de_overpass',
};

/**
 * Map name for game server start (`+map`, orchestrator `--map`): always `de_*`, never UI labels.
 */
export function dedicatedServerMapName(input: string): string {
  const fromPool = canonicalCompMapName(input);
  if (fromPool) {
    return POOL_DISPLAY_TO_LAUNCH[fromPool];
  }
  const t = input.trim().toLowerCase();
  if (/^de_[a-z0-9_]+$/.test(t)) {
    return t;
  }
  return t;
}
