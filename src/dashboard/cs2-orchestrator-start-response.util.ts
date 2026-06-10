/**
 * Parses game/tv ports from CS2 LAN orchestrator log lines, e.g.
 * `(game:27015 tv:27115 map:de_inferno)` or `game:27015 tv:27115`.
 */
export function parseGameTvPortsFromOrchestratorText(text: string): {
  gamePort: number;
  tvPort: number | null;
} {
  const m =
    /\(\s*game:\s*(\d+)\s+tv:\s*(\d+)/i.exec(text) ??
    /game:\s*(\d+)\s+tv:\s*(\d+)/i.exec(text);
  if (m) {
    return {
      gamePort: Number.parseInt(m[1]!, 10),
      tvPort: Number.parseInt(m[2]!, 10),
    };
  }
  return { gamePort: 27015, tvPort: null };
}

export type Cs2ApiStartJson = {
  status?: string;
  matchId?: string;
  output?: string;
  log?: string;
  gamePort?: number;
  tvPort?: number;
};
