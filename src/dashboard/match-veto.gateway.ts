import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';

import type { JwtPayload } from '../auth/jwt.strategy';
import { LobbyBroadcastService } from '../lobbies/lobby-broadcast.service';
import { LobbyMembershipResolver } from '../lobbies/lobby-membership.resolver';
import { MatchVetoBroadcastService } from './match-veto-broadcast.service';
import { PlayerMatchVetoService } from './player-match-veto.service';

@WebSocketGateway({
  namespace: '/veto',
  cors: { origin: true, credentials: true },
})
export class MatchVetoGateway implements OnGatewayInit, OnGatewayConnection {
  /**
   * Typed as `Namespace` because Nest's `@WebSocketServer()` on a gateway
   * declared with `namespace: '/veto'` injects the namespace, not the root
   * `Server`. See `LobbyBroadcastService` for the bug this typing prevents.
   */
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(MatchVetoGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly vetoBroadcast: MatchVetoBroadcastService,
    private readonly vetoService: PlayerMatchVetoService,
    private readonly lobbyBroadcast: LobbyBroadcastService,
    private readonly lobbyMembership: LobbyMembershipResolver,
  ) {}

  afterInit(): void {
    this.vetoBroadcast.attachServer(this.server);
    this.lobbyBroadcast.attachServer(this.server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractBearerToken(client);
    if (!token) {
      this.logger.warn('Veto socket rejected: missing token');
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      client.data.steamId = payload.sub;
    } catch {
      this.logger.warn('Veto socket rejected: invalid token');
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const matchId = this.readMatchId(body);
    if (!matchId) {
      return { ok: false, error: 'matchId required' };
    }
    const steamId = client.data.steamId as string | undefined;
    if (!steamId) {
      return { ok: false, error: 'unauthorized' };
    }
    try {
      await this.vetoService.getVetoState(matchId, steamId);
    } catch {
      return { ok: false, error: 'forbidden' };
    }
    await client.join(this.roomFor(matchId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const matchId = this.readMatchId(body);
    if (!matchId) {
      return { ok: false, error: 'matchId required' };
    }
    await client.leave(this.roomFor(matchId));
    return { ok: true };
  }

  @SubscribeMessage('subscribe_lobby')
  async subscribeLobby(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const lobbyId = this.readLobbyId(body);
    if (!lobbyId) {
      return { ok: false, error: 'lobbyId required' };
    }
    const steamId = client.data.steamId as string | undefined;
    if (!steamId) {
      return { ok: false, error: 'unauthorized' };
    }
    const allowed = await this.lobbyMembership
      .isMemberBySteamId(lobbyId, steamId)
      .catch(() => false);
    if (!allowed) {
      return { ok: false, error: 'forbidden' };
    }
    await client.join(LobbyBroadcastService.room(lobbyId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe_lobby')
  async unsubscribeLobby(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const lobbyId = this.readLobbyId(body);
    if (!lobbyId) {
      return { ok: false, error: 'lobbyId required' };
    }
    await client.leave(LobbyBroadcastService.room(lobbyId));
    return { ok: true };
  }

  private readLobbyId(body: unknown): string | null {
    if (body == null || typeof body !== 'object') {
      return null;
    }
    const raw = (body as { lobbyId?: unknown }).lobbyId;
    if (typeof raw !== 'string' || !raw.trim()) {
      return null;
    }
    return raw.trim();
  }

  private roomFor(matchId: string): string {
    return `match:${matchId}`;
  }

  private readMatchId(body: unknown): string | null {
    if (body == null || typeof body !== 'object') {
      return null;
    }
    const raw = (body as { matchId?: unknown }).matchId;
    if (typeof raw !== 'string' || !raw.trim()) {
      return null;
    }
    return raw.trim();
  }

  private extractBearerToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token.trim()) {
      return auth.token.replace(/^Bearer\s+/i, '').trim();
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim();
    }
    return null;
  }
}
