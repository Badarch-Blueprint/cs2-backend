import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/**
 * Holds the Socket.IO `/veto` namespace handle so {@link PlayerMatchVetoService}
 * can push veto updates without depending on the WebSocket gateway (avoids DI
 * cycles). The gateway passes in a `Namespace` because it declares
 * `namespace: '/veto'` — see {@link LobbyBroadcastService} for context.
 */
@Injectable()
export class MatchVetoBroadcastService {
  private server: Namespace | null = null;

  attachServer(server: Namespace): void {
    this.server = server;
  }

  emitVetoUpdated(matchId: string): void {
    this.server?.to(`match:${matchId}`).emit('veto_updated', { matchId });
  }

  /** When match row changes (e.g. server LIVE, scores); clients refetch veto state. */
  emitMatchUpdated(matchId: string): void {
    this.server?.to(`match:${matchId}`).emit('match_updated', { matchId });
  }
}
