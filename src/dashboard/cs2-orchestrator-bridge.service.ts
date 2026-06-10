import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { dedicatedServerMapName } from '../matches/cs2-map-pool';
import { mapVetoFormatFromMatchCode } from '../matches/map-veto-sequence';
import { TeamMember } from '../teams/team-member.entity';
import type { Cs2ApiStartJson } from './cs2-orchestrator-start-response.util';
import { parseGameTvPortsFromOrchestratorText } from './cs2-orchestrator-start-response.util';
import { MatchVetoBroadcastService } from './match-veto-broadcast.service';

const DEFAULT_CONNECT_HOST = '192.168.10.63';
const START_LOG_MAX = 12_000;

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
 * Calls the CS2 LAN orchestrator HTTP bridge: `POST {CS2_HOST_URL}/api/start`
 * with `{ matchId, map, isDecider, team1, team2 }`. On success, parses ports
 * from JSON `output`/`log`,
 * persists {@link Match} server fields, sets status {@link MatchStatus.LIVE},
 * and pushes `match_updated` (+ `veto_updated`) over Socket.IO.
 *
 * When `CS2_HOST_URL` is unset, requests are skipped (local dev without a host).
 */
@Injectable()
export class Cs2OrchestratorBridgeService {
  private readonly logger = new Logger(Cs2OrchestratorBridgeService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    @InjectRepository(TeamMember)
    private readonly membersRepo: Repository<TeamMember>,
    private readonly vetoBroadcast: MatchVetoBroadcastService,
  ) {}

  /**
   * Fire-and-forget after veto persistence: does not throw to callers.
   * Match id must match the platform `matches.id` (used as Docker match id on the host).
   */
  requestDedicatedServerAfterVeto(matchId: string, mapName: string): void {
    const base = this.config.get<string>('CS2_HOST_URL')?.trim();
    if (!base) {
      this.logger.debug(
        'CS2_HOST_URL is unset; skipping POST /api/start (orchestrator not configured)',
      );
      return;
    }
    const url = `${base.replace(/\/$/, '')}/api/start`;
    void this.resolveLaunchMap(matchId, mapName)
      .then((launchMap) => {
        if (launchMap == null) {
          return;
        }
        return this.postStart(url, matchId, launchMap);
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `CS2 orchestrator start failed for match ${matchId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private async resolveLaunchMap(
    matchId: string,
    requestedMap: string,
  ): Promise<string | null> {
    const requestedLaunchMap = dedicatedServerMapName(requestedMap);
    const match = await this.matchesRepo.findOne({ where: { id: matchId } });
    if (!match) {
      return requestedLaunchMap;
    }
    if (match.lobbyId) {
      // Lobby rentals have their own provisioner; never hit the tournament orchestrator.
      this.logger.debug(
        `Match ${matchId} is a lobby rental; skipping tournament orchestrator POST`,
      );
      return null;
    }
    const format = mapVetoFormatFromMatchCode(match.code);
    if (format !== 'bo3') {
      return requestedLaunchMap;
    }
    const decider = match.mapName?.trim()
      ? dedicatedServerMapName(match.mapName)
      : null;
    const openingPick = match.vetoPicks?.[0]?.trim()
      ? dedicatedServerMapName(match.vetoPicks[0]!)
      : null;
    if (
      decider &&
      openingPick &&
      requestedLaunchMap === decider &&
      openingPick !== decider
    ) {
      this.logger.log(
        `Match ${matchId} BO3 launch remapped ${requestedLaunchMap} -> ${openingPick} (opening map)`,
      );
      return openingPick;
    }
    return requestedLaunchMap;
  }

  private connectHost(): string {
    const fromEnv = this.config.get<string>('CS2_GAME_CONNECT_HOST')?.trim();
    if (fromEnv) {
      return fromEnv;
    }
    return DEFAULT_CONNECT_HOST;
  }

  private async postStart(
    url: string,
    matchId: string,
    mapName: string,
  ): Promise<void> {
    const startPayload = await this.buildStartPayload(matchId, mapName);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(startPayload),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    let json: Cs2ApiStartJson = {};
    try {
      json = text ? (JSON.parse(text) as Cs2ApiStartJson) : {};
    } catch {
      this.logger.warn(`CS2 orchestrator returned non-JSON for match ${matchId}; skipping DB update`);
      return;
    }

    if (json.matchId && json.matchId !== matchId) {
      this.logger.warn(
        `CS2 orchestrator matchId mismatch (expected ${matchId}, got ${json.matchId}); skipping DB update`,
      );
      return;
    }

    const combined = [json.output, json.log].filter((x): x is string => typeof x === 'string').join('\n');
    let gamePort =
      typeof json.gamePort === 'number' && Number.isFinite(json.gamePort)
        ? json.gamePort
        : null;
    let tvPort =
      typeof json.tvPort === 'number' && Number.isFinite(json.tvPort) ? json.tvPort : null;

    if (gamePort == null || tvPort == null) {
      const parsed = parseGameTvPortsFromOrchestratorText(combined);
      if (gamePort == null) {
        gamePort = parsed.gamePort;
      }
      if (tvPort == null) {
        tvPort = parsed.tvPort;
      }
    }

    const host = this.connectHost();
    const connectCommand = `connect ${host}:${gamePort}`;

    const match = await this.matchesRepo.findOne({ where: { id: matchId } });
    if (!match) {
      this.logger.warn(`Match ${matchId} not found after orchestrator OK; cannot save server info`);
      return;
    }
    if (match.status !== MatchStatus.CONFIGURING_SERVER) {
      this.logger.warn(
        `Match ${matchId} is ${match.status}, not CONFIGURING_SERVER; not overwriting server fields`,
      );
      return;
    }

    match.status = MatchStatus.LIVE;
    match.gameServerHost = host;
    match.gamePort = gamePort;
    match.tvPort = tvPort;
    match.connectCommand = connectCommand;
    match.cs2StartLog = combined.length > START_LOG_MAX ? combined.slice(0, START_LOG_MAX) : combined;

    await this.matchesRepo.save(match);

    this.logger.log(
      `Match ${matchId} is LIVE — connect ${host}:${gamePort} (tv ${tvPort ?? '—'}) [map ${mapName}]`,
    );

    this.vetoBroadcast.emitMatchUpdated(matchId);
    this.vetoBroadcast.emitVetoUpdated(matchId);
  }

  private async buildStartPayload(
    matchId: string,
    mapName: string,
  ): Promise<OrchestratorStartPayload> {
    const match = await this.matchesRepo.findOne({
      where: { id: matchId },
      relations: { teamA: true, teamB: true },
    });
    if (!match) {
      return {
        matchId,
        map: mapName,
        isDecider: false,
        team1: { name: 'TBD', players: {} },
        team2: { name: 'TBD', players: {} },
      };
    }

    const teamIds = [match.teamA?.id, match.teamB?.id].filter(
      (id): id is string => !!id,
    );
    const members =
      teamIds.length === 0
        ? []
        : await this.membersRepo.find({
            where: { teamId: In(teamIds) },
            order: { createdAt: 'ASC' },
          });

    const team1Players: Record<string, string> = {};
    const team2Players: Record<string, string> = {};
    for (const m of members) {
      if (m.teamId === match.teamA?.id) {
        team1Players[m.steamId] = m.name;
      } else if (m.teamId === match.teamB?.id) {
        team2Players[m.steamId] = m.name;
      }
    }

    const deciderMap = match.mapName?.trim()
      ? dedicatedServerMapName(match.mapName)
      : null;
    const isDecider = deciderMap != null && deciderMap === mapName;

    return {
      matchId,
      map: mapName,
      isDecider,
      team1: {
        name: match.teamA?.name ?? 'TBD',
        players: team1Players,
      },
      team2: {
        name: match.teamB?.name ?? 'TBD',
        players: team2Players,
      },
    };
  }
}
