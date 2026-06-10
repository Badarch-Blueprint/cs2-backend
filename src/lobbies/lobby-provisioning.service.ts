import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import {
  type Cs2ApiStartJson,
  parseGameTvPortsFromOrchestratorText,
} from '../dashboard/cs2-orchestrator-start-response.util';
import {
  dedicatedServerMapName,
  remainingMapAfterRemoved,
} from '../matches/cs2-map-pool';
import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { User } from '../users/user.entity';
import type { AdminUpdateRentalServerDto } from './dto/admin-update-rental-server.dto';
import type { RentalServerView } from './dto/lobby.view';
import { Lobby } from './entities/lobby.entity';
import { LobbyMember } from './entities/lobby-member.entity';
import { RentalServer } from './entities/rental-server.entity';
import {
  LOBBY_PROVISIONING_REQUESTED,
  type LobbyProvisioningRequestedEvent,
} from './lobby.events';
import { LobbyBroadcastService } from './lobby-broadcast.service';
import { buildConnectString } from './connect-string';
import { cancelLinkedMatchIfOpen } from './lobby-match-cancel.util';
import type { RentalServerStatus } from './lobby.types';

const DEFAULT_CONNECT_HOST = '192.168.10.63';

type OrchestratorTeamPayload = {
  readonly name: string;
  readonly players: Readonly<Record<string, string>>;
};

type OrchestratorStartPayload = {
  readonly matchId: string;
  readonly map: string;
  readonly isDecider: boolean;
  readonly team1: OrchestratorTeamPayload;
  readonly team2: OrchestratorTeamPayload;
};

/**
 * Responsible for driving a RentalServer through its lifecycle. Today the
 * actual CS2 provisioner is a stub — see the `// TODO` in
 * {@link handleProvisioningRequested}. During development the admin PATCH
 * endpoint calls {@link applyAdminUpdate} to simulate readiness.
 *
 * Since veto + series state moved onto the Match row, this service never
 * flips the lobby's own status (which now stays `STARTED` until cleanup).
 * Instead it updates `match.status`/`match.mapName` and emits
 * `lobby.match.statusChanged` events on the lobby socket room.
 */
@Injectable()
export class LobbyProvisioningService {
  private readonly logger = new Logger(LobbyProvisioningService.name);

  constructor(
    @InjectRepository(Lobby)
    private readonly lobbiesRepo: Repository<Lobby>,
    @InjectRepository(LobbyMember)
    private readonly membersRepo: Repository<LobbyMember>,
    @InjectRepository(RentalServer)
    private readonly serversRepo: Repository<RentalServer>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    private readonly broadcast: LobbyBroadcastService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  @OnEvent(LOBBY_PROVISIONING_REQUESTED)
  handleProvisioningRequested(event: LobbyProvisioningRequestedEvent): void {
    const total = event.vetoSeriesMaps.length;
    const leg = event.seriesMapIndex + 1;
    this.logger.log(
      `provisioning request received: lobby=${event.lobbyId} mode=${event.mode} region=${event.region} map=${event.mapName} (${leg}/${total}${event.isFinalMap ? ', final' : ''})`,
    );
    void this.dispatchOrchestratorStart(event).catch((err: unknown) => {
      this.logger.warn(
        `CS2 orchestrator start failed for lobby ${event.lobbyId} match ${event.matchId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Forwards the map provisioning request to the CS2 LAN orchestrator
   * (`POST {CS2_HOST_URL}/api/start`). Mirrors
   * {@link Cs2OrchestratorBridgeService} but builds the team payloads from
   * `lobby_members`/`users` instead of the tournament team rosters. Fire-and
   * -forget from {@link handleProvisioningRequested}; errors are swallowed and
   * logged so the rental stays `PROVISIONING` and admin PATCH can still
   * recover manually.
   *
   * If the orchestrator response contains `gamePort`, we apply host/port to
   * the rental row and promote the match to {@link MatchStatus.LIVE}
   * synchronously. If it doesn't, the rental stays `PROVISIONING` and we
   * wait for the external backend to PATCH back via
   * `/api/admin/rental-servers/:id`.
   */
  private async dispatchOrchestratorStart(
    event: LobbyProvisioningRequestedEvent,
  ): Promise<void> {
    const base = this.config.get<string>('CS2_HOST_URL')?.trim();
    if (!base) {
      this.logger.debug(
        'CS2_HOST_URL is unset; leaving rental PROVISIONING (waiting for admin PATCH)',
      );
      return;
    }
    const url = `${base.replace(/\/$/, '')}/api/start`;
    const payload = await this.buildOrchestratorStartPayload(event);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    let json: Cs2ApiStartJson = {};
    if (text) {
      try {
        json = JSON.parse(text) as Cs2ApiStartJson;
      } catch {
        this.logger.warn(
          `CS2 orchestrator returned non-JSON for lobby ${event.lobbyId}; leaving rental PROVISIONING`,
        );
        return;
      }
    }

    if (json.matchId && json.matchId !== event.matchId) {
      this.logger.warn(
        `CS2 orchestrator matchId mismatch (expected ${event.matchId}, got ${json.matchId}); leaving rental PROVISIONING`,
      );
      return;
    }

    const combined = [json.output, json.log]
      .filter((x): x is string => typeof x === 'string')
      .join('\n');
    let gamePort =
      typeof json.gamePort === 'number' && Number.isFinite(json.gamePort)
        ? json.gamePort
        : null;
    let tvPort =
      typeof json.tvPort === 'number' && Number.isFinite(json.tvPort)
        ? json.tvPort
        : null;
    if (gamePort == null || tvPort == null) {
      const parsed = parseGameTvPortsFromOrchestratorText(combined);
      if (gamePort == null) {
        gamePort = parsed.gamePort;
      }
      if (tvPort == null) {
        tvPort = parsed.tvPort;
      }
    }

    if (gamePort == null) {
      this.logger.log(
        `Lobby ${event.lobbyId} orchestrator POST /api/start OK but no gamePort returned; waiting for admin PATCH callback`,
      );
      return;
    }

    await this.applyOrchestratorReady(event, gamePort, tvPort);
  }

  private async buildOrchestratorStartPayload(
    event: LobbyProvisioningRequestedEvent,
  ): Promise<OrchestratorStartPayload> {
    const members = await this.membersRepo.find({
      where: { lobbyId: event.lobbyId, leftAt: IsNull() },
      order: { joinedAt: 'ASC' },
    });
    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await this.usersRepo.find({ where: { id: In(userIds) } })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const team1Players: Record<string, string> = {};
    const team2Players: Record<string, string> = {};
    for (const m of members) {
      const user = userById.get(m.userId);
      if (!user) {
        continue;
      }
      const displayName = user.displayName?.trim() || user.steamId;
      if (m.team === 'A') {
        team1Players[user.steamId] = displayName;
      } else if (m.team === 'B') {
        team2Players[user.steamId] = displayName;
      }
    }

    return {
      matchId: event.matchId,
      map: dedicatedServerMapName(event.mapName),
      isDecider: event.isFinalMap && event.vetoSeriesMaps.length > 1,
      team1: { name: 'Team A', players: team1Players },
      team2: { name: 'Team B', players: team2Players },
    };
  }

  private connectHost(): string {
    const fromEnv = this.config.get<string>('CS2_GAME_CONNECT_HOST')?.trim();
    if (fromEnv) {
      return fromEnv;
    }
    return DEFAULT_CONNECT_HOST;
  }

  private async applyOrchestratorReady(
    event: LobbyProvisioningRequestedEvent,
    gamePort: number,
    tvPort: number | null,
  ): Promise<void> {
    const rental = await this.serversRepo.findOne({
      where: { id: event.rentalServerId },
    });
    if (!rental || rental.deletedAt) {
      this.logger.warn(
        `Rental ${event.rentalServerId} not found after orchestrator OK; cannot save server info`,
      );
      return;
    }
    if (rental.status !== 'PROVISIONING') {
      this.logger.warn(
        `Rental ${rental.id} is ${rental.status}, not PROVISIONING; not overwriting connect info`,
      );
      return;
    }
    const match = await this.matchesRepo.findOne({
      where: { id: event.matchId },
    });
    if (!match) {
      this.logger.warn(
        `Match ${event.matchId} not found after orchestrator OK; cannot promote to LIVE`,
      );
      return;
    }
    if (match.status !== MatchStatus.CONFIGURING_SERVER) {
      this.logger.warn(
        `Match ${match.id} is ${match.status}, not CONFIGURING_SERVER; not overwriting server fields`,
      );
      return;
    }

    rental.host = this.connectHost();
    rental.port = gamePort;
    rental.gotvPort = tvPort;
    await this.applyStatusChange(rental, 'READY', null);
    this.logger.log(
      `Lobby ${event.lobbyId} match ${event.matchId} is LIVE — connect ${rental.host}:${rental.port} (tv ${tvPort ?? '—'}) [map ${event.mapName}]`,
    );
  }

  /**
   * Wraps broadcast calls so a socket-layer bug (e.g. a bad type cast, a
   * detached namespace) cannot abort a provisioning flow after the rows have
   * already been persisted. Broadcasts are strictly best-effort — clients
   * refetch state on reconnect.
   */
  private safeEmit(fn: () => void, context: string): void {
    try {
      fn();
    } catch (err) {
      this.logger.warn(
        `broadcast failed (${context}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async listAll(): Promise<RentalServer[]> {
    return this.serversRepo.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<RentalServer> {
    const row = await this.serversRepo.findOne({ where: { id } });
    if (!row || row.deletedAt) {
      throw new NotFoundException(`Rental server ${id} not found`);
    }
    return row;
  }

  async applyAdminUpdate(
    id: string,
    dto: AdminUpdateRentalServerDto,
  ): Promise<{ rental: RentalServer; view: RentalServerView }> {
    const rental = await this.findById(id);
    if (dto.host !== undefined) rental.host = dto.host;
    if (dto.port !== undefined) rental.port = dto.port;
    if (dto.gotvPort !== undefined) rental.gotvPort = dto.gotvPort;
    if (dto.endsAt !== undefined) rental.endsAt = dto.endsAt;
    if (dto.status !== undefined) {
      await this.applyStatusChange(rental, dto.status, dto.reason ?? null);
    }
    const saved = await this.serversRepo.save(rental);
    return {
      rental: saved,
      view: {
        id: saved.id,
        status: saved.status,
        host: saved.host,
        port: saved.port,
        gotvPort: saved.gotvPort,
        connectString: saved.connectString,
        endsAt: saved.endsAt ? saved.endsAt.toISOString() : null,
      },
    };
  }

  private async applyStatusChange(
    rental: RentalServer,
    newStatus: RentalServerStatus,
    reason: string | null,
  ): Promise<void> {
    rental.status = newStatus;

    // Collect broadcasts as deferred closures so we can persist rows BEFORE
    // emitting. A broadcast failure must never leave the match/rental rows
    // in an inconsistent state (e.g. match=LIVE but rental=PROVISIONING).
    const deferred: Array<{ fn: () => void; context: string }> = [];

    if (newStatus === 'READY' || newStatus === 'ACTIVE') {
      if (!rental.host || rental.port == null) {
        throw new BadRequestException(
          'Rental server needs host and port before status can be READY/ACTIVE',
        );
      }
      const lobby = await this.findLobbyForRental(rental.id);
      rental.connectString = buildConnectString({
        host: rental.host,
        port: rental.port,
        password: lobby.serverPassword,
      });
      if (rental.startedAt == null) {
        rental.startedAt = new Date();
      }
      const match = lobby.matchId
        ? await this.matchesRepo.findOne({ where: { id: lobby.matchId } })
        : null;
      if (match && match.status === MatchStatus.CONFIGURING_SERVER) {
        match.status = MatchStatus.LIVE;
        match.gameServerHost = rental.host;
        match.gamePort = rental.port;
        match.tvPort = rental.gotvPort;
        match.connectCommand = rental.connectString;
        await this.matchesRepo.save(match);
        await this.serversRepo.save(rental);
        const steamIds = await this.memberSteamIds(lobby.id);
        const matchId = match.id;
        const readyPayload = {
          host: rental.host,
          port: rental.port,
          gotvPort: rental.gotvPort,
          connectString: rental.connectString,
          endsAt: rental.endsAt ? rental.endsAt.toISOString() : null,
          map: match.mapName,
          seriesMapIndex: this.seriesIndexFromMatch(match),
        };
        deferred.push({
          context: 'lobby.match.statusChanged(LIVE)',
          fn: () =>
            this.broadcast.emit(lobby.id, 'lobby.match.statusChanged', {
              matchId,
              status: MatchStatus.LIVE,
            }),
        });
        deferred.push({
          context: 'lobby.server.ready',
          fn: () =>
            this.broadcast.emitToSteamIds(
              lobby.id,
              steamIds,
              'lobby.server.ready',
              readyPayload,
            ),
        });
      } else {
        await this.serversRepo.save(rental);
      }
    } else if (newStatus === 'FAILED') {
      const lobby = await this.findLobbyForRental(rental.id);
      if (lobby.matchId) {
        const match = await this.matchesRepo.findOne({
          where: { id: lobby.matchId },
        });
        if (
          match &&
          match.status !== MatchStatus.FINISHED &&
          match.status !== MatchStatus.CANCELLED
        ) {
          match.status = MatchStatus.CANCELLED;
          match.endAt = new Date();
          await this.matchesRepo.save(match);
          const matchId = match.id;
          deferred.push({
            context: 'lobby.match.statusChanged(CANCELLED)',
            fn: () =>
              this.broadcast.emit(lobby.id, 'lobby.match.statusChanged', {
                matchId,
                status: MatchStatus.CANCELLED,
                reason: reason ?? 'provisioning_failed',
              }),
          });
        }
      }
      await this.serversRepo.save(rental);
      // Keep the lobby status untouched — host/admin can call /cancel if they
      // want to force-close the room. The match being CANCELLED is the
      // signal players actually care about.
    } else if (newStatus === 'EXPIRED' || newStatus === 'RELEASED') {
      const lobby = await this.findLobbyForRental(rental.id);
      if (lobby.matchId) {
        const match = await this.matchesRepo.findOne({
          where: { id: lobby.matchId },
        });
        if (
          match &&
          match.status !== MatchStatus.FINISHED &&
          match.status !== MatchStatus.CANCELLED
        ) {
          match.status = MatchStatus.FINISHED;
          match.endAt = new Date();
          await this.matchesRepo.save(match);
          const matchId = match.id;
          deferred.push({
            context: 'lobby.match.statusChanged(FINISHED)',
            fn: () =>
              this.broadcast.emit(lobby.id, 'lobby.match.statusChanged', {
                matchId,
                status: MatchStatus.FINISHED,
              }),
          });
        }
      }
      rental.connectString = null;
      rental.host = null;
      rental.port = null;
      rental.gotvPort = null;
      await this.serversRepo.save(rental);
    } else {
      await this.serversRepo.save(rental);
    }

    for (const { fn, context } of deferred) {
      this.safeEmit(fn, context);
    }
  }

  /**
   * Called when the external backend reports that the map currently running on
   * `rentalId` has finished. Tears the rental down, and if there is another
   * map in the series, re-arms the same rental row for the next map and
   * re-emits {@link LOBBY_PROVISIONING_REQUESTED}. Otherwise the linked match
   * is marked FINISHED.
   */
  async mapFinished(
    rentalId: string,
    opts: { reason?: string | null } = {},
  ): Promise<RentalServerView> {
    const rental = await this.findById(rentalId);
    const lobby = await this.findLobbyForRental(rental.id);
    if (!lobby.matchId) {
      throw new BadRequestException(
        `Lobby ${lobby.id} has no linked match to advance`,
      );
    }
    const match = await this.matchesRepo.findOne({
      where: { id: lobby.matchId },
    });
    if (!match) {
      throw new NotFoundException(`Match ${lobby.matchId} not found`);
    }
    if (match.status !== MatchStatus.LIVE &&
        match.status !== MatchStatus.CONFIGURING_SERVER) {
      throw new BadRequestException(
        `Match ${match.id} is not running (status=${match.status})`,
      );
    }

    const series = this.seriesMapsForMatch(match);
    const finishedMap = match.mapName ?? series[0] ?? null;
    const finishedIndex = finishedMap
      ? series.findIndex(
          (m) => m.toLowerCase() === finishedMap.toLowerCase(),
        )
      : -1;
    const nextIndex = finishedIndex + 1;
    const hasNext = finishedIndex >= 0 && nextIndex < series.length;

    rental.host = null;
    rental.port = null;
    rental.gotvPort = null;
    rental.connectString = null;

    if (!hasNext) {
      rental.status = 'RELEASED';
      const saved = await this.serversRepo.save(rental);
      match.status = MatchStatus.FINISHED;
      match.endAt = new Date();
      await this.matchesRepo.save(match);
      this.safeEmit(
        () =>
          this.broadcast.emit(lobby.id, 'lobby.map.finished', {
            seriesMapIndex: finishedIndex,
            map: finishedMap,
            reason: opts.reason ?? null,
          }),
        'lobby.map.finished',
      );
      this.safeEmit(
        () =>
          this.broadcast.emit(lobby.id, 'lobby.match.statusChanged', {
            matchId: match.id,
            status: MatchStatus.FINISHED,
          }),
        'lobby.match.statusChanged(FINISHED)',
      );
      return this.viewOf(saved);
    }

    const nextMap = series[nextIndex]!;
    match.mapName = nextMap;
    match.status = MatchStatus.CONFIGURING_SERVER;
    await this.matchesRepo.save(match);

    rental.status = 'PROVISIONING';
    const saved = await this.serversRepo.save(rental);

    this.safeEmit(
      () =>
        this.broadcast.emit(lobby.id, 'lobby.map.finished', {
          seriesMapIndex: finishedIndex,
          map: finishedMap,
          reason: opts.reason ?? null,
        }),
      'lobby.map.finished',
    );
    this.safeEmit(
      () =>
        this.broadcast.emit(lobby.id, 'lobby.match.statusChanged', {
          matchId: match.id,
          status: MatchStatus.CONFIGURING_SERVER,
        }),
      'lobby.match.statusChanged(CONFIGURING_SERVER)',
    );
    this.safeEmit(
      () =>
        this.broadcast.emit(lobby.id, 'lobby.map.advanced', {
          seriesMapIndex: nextIndex,
          map: nextMap,
        }),
      'lobby.map.advanced',
    );

    const payload: LobbyProvisioningRequestedEvent = {
      lobbyId: lobby.id,
      matchId: match.id,
      rentalServerId: saved.id,
      mode: lobby.mode,
      region: lobby.region,
      features: lobby.features,
      mapName: nextMap,
      seriesMapIndex: nextIndex,
      isFinalMap: nextIndex === series.length - 1,
      vetoSeriesMaps: series,
      serverPassword: lobby.serverPassword,
    };
    this.events.emit(LOBBY_PROVISIONING_REQUESTED, payload);
    this.logger.log(
      `Lobby ${lobby.id} map ${finishedIndex + 1}/${series.length} finished — advancing to ${nextMap} (${nextIndex + 1}/${series.length})`,
    );
    return this.viewOf(saved);
  }

  /** Derives the ordered `[...picks, decider]` list directly from the match row. */
  private seriesMapsForMatch(match: Match): string[] {
    const picks = [...(match.vetoPicks ?? [])];
    const bans = [...(match.vetoBans ?? [])];
    const decider = remainingMapAfterRemoved([...bans, ...picks]);
    if (picks.length === 0) {
      return decider ? [decider] : match.mapName ? [match.mapName] : [];
    }
    return decider ? [...picks, decider] : picks;
  }

  private seriesIndexFromMatch(match: Match): number {
    const series = this.seriesMapsForMatch(match);
    if (!match.mapName) {
      return 0;
    }
    const idx = series.findIndex(
      (m) => m.toLowerCase() === match.mapName!.toLowerCase(),
    );
    return idx < 0 ? 0 : idx;
  }

  private viewOf(rental: RentalServer): RentalServerView {
    return {
      id: rental.id,
      status: rental.status,
      host: rental.host,
      port: rental.port,
      gotvPort: rental.gotvPort,
      connectString: rental.connectString,
      endsAt: rental.endsAt ? rental.endsAt.toISOString() : null,
    };
  }

  private async findLobbyForRental(rentalId: string): Promise<Lobby> {
    const lobby = await this.lobbiesRepo.findOne({
      where: { rentalServerId: rentalId },
    });
    if (!lobby) {
      throw new NotFoundException(`Lobby for rental ${rentalId} not found`);
    }
    return lobby;
  }

  private async memberSteamIds(lobbyId: string): Promise<string[]> {
    const members = await this.membersRepo.find({
      where: { lobbyId, leftAt: IsNull() },
    });
    if (members.length === 0) {
      return [];
    }
    const users = await this.usersRepo.find({
      where: { id: In(members.map((m) => m.userId)) },
    });
    return users.map((u) => u.steamId);
  }
}
