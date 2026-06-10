import type { Repository } from 'typeorm';

import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';

/**
 * When a rental lobby is cancelled, keep the linked {@link Match} row from
 * staying in an active workflow state.
 */
export async function cancelLinkedMatchIfOpen(
  matchesRepo: Repository<Match>,
  lobby: { readonly matchId: string | null },
): Promise<void> {
  if (!lobby.matchId) {
    return;
  }
  const match = await matchesRepo.findOne({ where: { id: lobby.matchId } });
  if (!match) {
    return;
  }
  if (
    match.status === MatchStatus.FINISHED ||
    match.status === MatchStatus.CANCELLED
  ) {
    return;
  }
  match.status = MatchStatus.CANCELLED;
  await matchesRepo.save(match);
}
