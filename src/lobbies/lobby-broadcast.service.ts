import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/**
 * Emits `lobby.*` events on the `/veto` Socket.IO namespace (same namespace
 * as match veto; rooms are keyed `lobby:<lobbyId>`). Holds the namespace
 * handle so services avoid a direct gateway dependency and stay testable.
 *
 * NOTE: Nest's `@WebSocketServer()` on a gateway declared with
 * `namespace: '/veto'` injects the Namespace, not the root Server, so we
 * type the field as `Namespace` and use `nsp.adapter` / `nsp.sockets`
 * directly instead of `server.of('/veto')` (which does not exist on a
 * Namespace).
 */
@Injectable()
export class LobbyBroadcastService {
  private readonly logger = new Logger(LobbyBroadcastService.name);
  private server: Namespace | null = null;

  attachServer(server: Namespace): void {
    this.server = server;
  }

  static room(lobbyId: string): string {
    return `lobby:${lobbyId}`;
  }

  emit(lobbyId: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.debug(`WS server not attached yet; dropping ${event}`);
      return;
    }
    this.server.to(LobbyBroadcastService.room(lobbyId)).emit(event, payload);
  }

  /**
   * Send `event` only to sockets in the lobby room whose authenticated Steam
   * id is in `recipientSteamIds`. Used to gate the connect string to lobby
   * members (and admins, if they subscribed with their admin JWT).
   */
  emitToSteamIds(
    lobbyId: string,
    recipientSteamIds: readonly string[],
    event: string,
    payload: unknown,
  ): void {
    const nsp = this.server;
    if (!nsp) {
      return;
    }
    const room = LobbyBroadcastService.room(lobbyId);
    const allowed = new Set(recipientSteamIds);
    const sockets = nsp.adapter.rooms.get(room);
    if (!sockets) {
      return;
    }
    for (const socketId of sockets) {
      const sock = nsp.sockets.get(socketId);
      if (!sock) {
        continue;
      }
      const steamId = sock.data?.steamId as string | undefined;
      if (steamId && allowed.has(steamId)) {
        sock.emit(event, payload);
      }
    }
  }
}
