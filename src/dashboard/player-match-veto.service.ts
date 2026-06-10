import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import {
  CS2_COMP_MAP_POOL,
  canonicalCompMapName,
  remainingMapAfterRemoved,
} from '../matches/cs2-map-pool';
import {
  mapVetoFormatFromMatchCode,
  mapVetoStepsForFormat,
  totalMapVetoSteps,
  type MapVetoFormat,
  type MapVetoStepKind,
} from '../matches/map-veto-sequence';
import { Lobby } from '../lobbies/entities/lobby.entity';
import { LobbyMember } from '../lobbies/entities/lobby-member.entity';
import { RentalServer } from '../lobbies/entities/rental-server.entity';
import {
  LOBBY_PROVISIONING_REQUESTED,
  type LobbyProvisioningRequestedEvent,
} from '../lobbies/lobby.events';
import { TeamMember } from '../teams/team-member.entity';
import { User } from '../users/user.entity';
import { Cs2OrchestratorBridgeService } from './cs2-orchestrator-bridge.service';
import { MatchVetoBroadcastService } from './match-veto-broadcast.service';

export type MatchVetoViewerDto = {
  readonly steamId: string;
  readonly isMember: boolean;
  readonly teamSide: 'team_a' | 'team_b' | null;
  readonly isCaptain: boolean;
  /** True when this captain may submit the current veto action. */
  readonly canBanNow: boolean;
};

export type MatchVetoRosterMemberDto = {
  readonly id: string;
  readonly name: string;
  readonly isCaptain: boolean;
  /** Steam avatar when a linked `users` row exists. */
  readonly avatarUrl: string | null;
  readonly isViewer: boolean;
};

export type MatchGameServerDto = {
  readonly host: string;
  readonly gamePort: number;
  readonly tvPort: number | null;
  readonly connectCommand: string;
};

export type MatchVetoStateDto = {
  readonly matchId: string;
  /**
   * Populated when the match was created from a rental lobby — the veto UI
   * reads this to wire the "Back to lobby" link and to know the source of the
   * roster (lobby members vs. tournament team rows).
   */
  readonly lobby: { readonly id: string } | null;
  readonly code: string;
  readonly status: MatchStatus;
  readonly stageLabel: string;
  readonly vetoFormat: MapVetoFormat;
  readonly teamA: {
    readonly id: string;
    readonly name: string;
    readonly members: readonly MatchVetoRosterMemberDto[];
  };
  readonly teamB: {
    readonly id: string;
    readonly name: string;
    readonly members: readonly MatchVetoRosterMemberDto[];
  };
  readonly mapPool: readonly string[];
  readonly vetoBans: readonly string[];
  readonly vetoPicks: readonly string[];
  readonly vetoPickSides: readonly ('ct' | 't')[];
  readonly mapName: string | null;
  readonly nextSide: 'team_a' | 'team_b' | null;
  /** Current step action while in {@link MatchStatus.VETO_PHASE}; null if not applicable. */
  readonly currentVetoAction: MapVetoStepKind | null;
  readonly viewer: MatchVetoViewerDto;
  readonly vetoComplete: boolean;
  readonly gameServer: MatchGameServerDto | null;
};

type Membership = {
  readonly isMember: boolean;
  readonly teamSide: 'team_a' | 'team_b' | null;
  readonly isCaptain: boolean;
};

type VetoContext = {
  readonly format: MapVetoFormat;
  readonly membership: Membership;
};

/**
 * Lives on the dashboard module so both tournament and lobby-rental matches
 * share a single veto implementation. The match row is the single source of
 * truth for veto arrays; authorization and roster building branch on
 * `match.lobbyId` so tournaments keep reading team_members while rental
 * matches read lobby_members.
 */
@Injectable()
export class PlayerMatchVetoService {
  private readonly logger = new Logger(PlayerMatchVetoService.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    @InjectRepository(TeamMember)
    private readonly membersRepo: Repository<TeamMember>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Lobby)
    private readonly lobbiesRepo: Repository<Lobby>,
    @InjectRepository(LobbyMember)
    private readonly lobbyMembersRepo: Repository<LobbyMember>,
    @InjectRepository(RentalServer)
    private readonly rentalsRepo: Repository<RentalServer>,
    private readonly vetoBroadcast: MatchVetoBroadcastService,
    private readonly cs2Orchestrator: Cs2OrchestratorBridgeService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  async getVetoState(
    matchId: string,
    viewerSteamId: string,
  ): Promise<MatchVetoStateDto> {
    const match = await this.loadMatchForVeto(matchId);

    const readable: readonly MatchStatus[] = [
      MatchStatus.WAITING_FOR_PLAYERS,
      MatchStatus.VETO_PHASE,
      MatchStatus.CONFIGURING_SERVER,
      MatchStatus.LIVE,
    ];
    if (!readable.includes(match.status)) {
      throw new BadRequestException(
        'Map veto is only available while this match is waiting for players, during veto, server setup, or live play',
      );
    }

    if (match.lobbyId) {
      return this.buildLobbyBackedVetoStateDto(match, viewerSteamId);
    }

    const membership = await this.resolveTeamMembership(
      viewerSteamId,
      match.teamA?.id,
      match.teamB?.id,
    );
    if (!membership.isMember) {
      throw new ForbiddenException('Only players on one of the two teams can open map veto');
    }

    return this.buildTournamentVetoStateDto(match, membership, viewerSteamId);
  }

  async banMap(
    matchId: string,
    viewerSteamId: string,
    rawMapName: string,
  ): Promise<MatchVetoStateDto> {
    const canonical = canonicalCompMapName(rawMapName);
    if (!canonical) {
      throw new BadRequestException('Unknown map name');
    }
    return this.applyVetoAction(matchId, viewerSteamId, {
      kind: 'map',
      map: canonical,
    });
  }

  async pickSide(
    matchId: string,
    viewerSteamId: string,
    side: 'ct' | 't',
  ): Promise<MatchVetoStateDto> {
    return this.applyVetoAction(matchId, viewerSteamId, {
      kind: 'side',
      side,
    });
  }

  private async applyVetoAction(
    matchId: string,
    viewerSteamId: string,
    action:
      | { readonly kind: 'map'; readonly map: string }
      | { readonly kind: 'side'; readonly side: 'ct' | 't' },
  ): Promise<MatchVetoStateDto> {
    let completedMap: string | null = null;
    let isLobbyMatch = false;

    await this.matchesRepo.manager.transaction(async (em) => {
      const match = await em.findOne(Match, {
        where: { id: matchId },
        relations: ['teamA', 'teamB'],
        lock: { mode: 'pessimistic_write', tables: ['matches'] },
      });
      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found`);
      }
      if (match.status !== MatchStatus.VETO_PHASE) {
        throw new BadRequestException('This match is not accepting veto actions right now');
      }

      isLobbyMatch = match.lobbyId != null;
      const ctx = await this.resolveVetoContext(match, viewerSteamId);
      if (!ctx.membership.isMember) {
        throw new ForbiddenException('Only roster players may submit a veto action');
      }
      if (!ctx.membership.isCaptain) {
        throw new ForbiddenException('Only the team captain may submit a veto action');
      }

      const steps = mapVetoStepsForFormat(ctx.format);
      const bans = [...(match.vetoBans ?? [])];
      const picks = [...(match.vetoPicks ?? [])];
      const pickSides = [...(match.vetoPickSides ?? [])];
      const stepIndex = bans.length + picks.length + pickSides.length;

      if (stepIndex >= steps.length) {
        throw new BadRequestException('Veto is already complete');
      }

      const step = steps[stepIndex]!;
      if (ctx.membership.teamSide !== step.side) {
        throw new BadRequestException('It is the other captain’s turn');
      }

      if (action.kind === 'map') {
        if (step.kind === 'side_pick') {
          throw new BadRequestException(
            'Current action is side selection. Submit CT/T side instead of a map.',
          );
        }
        const removed = [...bans, ...picks];
        if (removed.some((m) => m.toLowerCase() === action.map.toLowerCase())) {
          throw new BadRequestException('That map is already off the table');
        }
        if (step.kind === 'ban') {
          bans.push(action.map);
          match.vetoBans = bans;
        } else {
          picks.push(action.map);
          match.vetoPicks = picks;
        }
      } else {
        if (step.kind !== 'side_pick') {
          throw new BadRequestException('Current veto action is not side selection');
        }
        if (picks.length <= pickSides.length) {
          throw new BadRequestException('No picked map is awaiting side selection');
        }
        pickSides.push(action.side);
        match.vetoPickSides = pickSides;
      }

      completedMap = this.completeVetoIfDone(
        match,
        ctx.format,
        steps.length,
        stepIndex + 1,
      );

      await em.save(match);

      if (completedMap && isLobbyMatch) {
        await this.handleLobbyVetoCompletion(em, match, completedMap);
      }
    });

    if (completedMap && !isLobbyMatch) {
      this.cs2Orchestrator.requestDedicatedServerAfterVeto(matchId, completedMap);
    }

    this.vetoBroadcast.emitVetoUpdated(matchId);
    return this.getVetoState(matchId, viewerSteamId);
  }

  private async resolveVetoContext(
    match: Match,
    viewerSteamId: string,
  ): Promise<VetoContext> {
    if (match.lobbyId) {
      const lobby = await this.lobbiesRepo.findOne({
        where: { id: match.lobbyId },
      });
      if (!lobby) {
        throw new NotFoundException(`Lobby ${match.lobbyId} not found`);
      }
      const membership = await this.resolveLobbyMembership(
        match.lobbyId,
        viewerSteamId,
      );
      return { format: this.lobbyVetoFormat(lobby.mode), membership };
    }
    const teamAId = match.teamA?.id;
    const teamBId = match.teamB?.id;
    if (!teamAId || !teamBId) {
      throw new BadRequestException('Both teams must be assigned before veto');
    }
    const membership = await this.resolveTeamMembership(
      viewerSteamId,
      teamAId,
      teamBId,
    );
    return { format: mapVetoFormatFromMatchCode(match.code), membership };
  }

  private async buildTournamentVetoStateDto(
    match: Match,
    membership: Membership,
    viewerSteamId: string,
  ): Promise<MatchVetoStateDto> {
    const format = mapVetoFormatFromMatchCode(match.code);
    const bans = [...(match.vetoBans ?? [])];
    const picks = [...(match.vetoPicks ?? [])];
    const pickSides = [...(match.vetoPickSides ?? [])];
    const steps = mapVetoStepsForFormat(format);
    const stepIndex = bans.length + picks.length + pickSides.length;
    const totalSteps = totalMapVetoSteps(format);

    const nextSide =
      match.status === MatchStatus.VETO_PHASE && stepIndex < totalSteps
        ? steps[stepIndex]!.side
        : null;
    const currentVetoAction: MapVetoStepKind | null =
      match.status === MatchStatus.VETO_PHASE && stepIndex < totalSteps
        ? steps[stepIndex]!.kind
        : null;
    const vetoComplete =
      match.status !== MatchStatus.VETO_PHASE || stepIndex >= totalSteps;

    const viewer = this.buildViewer(
      viewerSteamId,
      membership,
      nextSide,
      match.status,
    );
    const { rosterA, rosterB } = await this.loadTournamentRosters(
      match.teamA?.id,
      match.teamB?.id,
      viewerSteamId,
    );

    return {
      matchId: match.id,
      lobby: null,
      code: match.code ?? '',
      status: match.status,
      stageLabel: this.stageLabelFromCode(match.code),
      vetoFormat: format,
      gameServer: this.gameServerFromMatch(match),
      teamA: {
        id: match.teamA?.id ?? '',
        name: match.teamA?.name ?? 'TBD',
        members: rosterA,
      },
      teamB: {
        id: match.teamB?.id ?? '',
        name: match.teamB?.name ?? 'TBD',
        members: rosterB,
      },
      mapPool: [...CS2_COMP_MAP_POOL],
      vetoBans: bans,
      vetoPicks: picks,
      vetoPickSides: pickSides,
      mapName: match.mapName ?? null,
      nextSide,
      currentVetoAction,
      viewer,
      vetoComplete,
    };
  }

  /**
   * Builds the veto-page DTO for matches that came from a rental lobby. Reads
   * auth + roster from {@link Lobby} / {@link LobbyMember}; the veto arrays
   * themselves live on the {@link Match} row (see {@link applyVetoAction}).
   */
  private async buildLobbyBackedVetoStateDto(
    match: Match,
    viewerSteamId: string,
  ): Promise<MatchVetoStateDto> {
    if (!match.lobbyId) {
      throw new BadRequestException('Match is not linked to a lobby');
    }
    const lobby = await this.lobbiesRepo.findOne({
      where: { id: match.lobbyId },
    });
    if (!lobby) {
      throw new NotFoundException(`Lobby ${match.lobbyId} not found`);
    }

    const members = await this.lobbyMembersRepo.find({
      where: { lobbyId: lobby.id, leftAt: IsNull() },
    });
    const viewerUser = await this.usersRepo.findOne({
      where: { steamId: viewerSteamId },
    });
    const viewerMember = viewerUser
      ? members.find((m) => m.userId === viewerUser.id) ?? null
      : null;
    if (!viewerMember) {
      throw new ForbiddenException(
        'Only lobby members can open map veto for this match',
      );
    }

    const teamSide: 'team_a' | 'team_b' | null =
      viewerMember.team === 'A'
        ? 'team_a'
        : viewerMember.team === 'B'
          ? 'team_b'
          : null;
    const isCaptain =
      viewerMember.role === 'HOST' || viewerMember.role === 'CAPTAIN';

    const format = this.lobbyVetoFormat(lobby.mode);
    const steps = mapVetoStepsForFormat(format);
    const totalSteps = totalMapVetoSteps(format);

    const bans = [...(match.vetoBans ?? [])];
    const picks = [...(match.vetoPicks ?? [])];
    const pickSides = [...(match.vetoPickSides ?? [])];
    const stepIndex = bans.length + picks.length + pickSides.length;

    const inVetoPhase = match.status === MatchStatus.VETO_PHASE;
    const nextSide =
      inVetoPhase && stepIndex < totalSteps ? steps[stepIndex]!.side : null;
    const currentVetoAction: MapVetoStepKind | null =
      inVetoPhase && stepIndex < totalSteps ? steps[stepIndex]!.kind : null;
    const vetoComplete = !inVetoPhase || stepIndex >= totalSteps;

    const canBanNow =
      inVetoPhase &&
      isCaptain &&
      teamSide != null &&
      teamSide === nextSide;

    const { rosterA, rosterB } = await this.buildLobbyRosters(
      members,
      viewerSteamId,
    );

    return {
      matchId: match.id,
      lobby: { id: lobby.id },
      code: match.code ?? '',
      status: match.status,
      stageLabel: `Lobby · ${lobby.mode}`,
      vetoFormat: format,
      gameServer: this.gameServerFromMatch(match),
      teamA: {
        id: `${lobby.id}:A`,
        name: 'Team A',
        members: rosterA,
      },
      teamB: {
        id: `${lobby.id}:B`,
        name: 'Team B',
        members: rosterB,
      },
      mapPool: [...CS2_COMP_MAP_POOL],
      vetoBans: bans,
      vetoPicks: picks,
      vetoPickSides: pickSides,
      mapName: match.mapName ?? null,
      nextSide,
      currentVetoAction,
      viewer: {
        steamId: viewerSteamId,
        isMember: teamSide != null,
        teamSide,
        isCaptain,
        canBanNow,
      },
      vetoComplete,
    };
  }

  private lobbyVetoFormat(mode: string): MapVetoFormat {
    if (mode === 'BO3') {
      return 'bo3';
    }
    if (mode === 'BO5') {
      return 'bo5';
    }
    return 'bo1';
  }

  private async buildLobbyRosters(
    members: readonly LobbyMember[],
    viewerSteamId: string,
  ): Promise<{
    rosterA: MatchVetoRosterMemberDto[];
    rosterB: MatchVetoRosterMemberDto[];
  }> {
    const userIds = [...new Set(members.map((m) => m.userId))];
    const users =
      userIds.length > 0
        ? await this.usersRepo.find({
            where: { id: In(userIds) },
          })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const toDto = (m: LobbyMember): MatchVetoRosterMemberDto => {
      const u = userById.get(m.userId);
      return {
        id: m.userId,
        name: u?.displayName ?? 'Unknown',
        isCaptain: m.role === 'HOST' || m.role === 'CAPTAIN',
        avatarUrl: u?.avatarUrl ?? null,
        isViewer: u?.steamId === viewerSteamId,
      };
    };

    const sortFn = (
      a: MatchVetoRosterMemberDto,
      b: MatchVetoRosterMemberDto,
    ): number => {
      if (a.isCaptain !== b.isCaptain) {
        return a.isCaptain ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    };

    const rosterA = members.filter((m) => m.team === 'A').map(toDto).sort(sortFn);
    const rosterB = members.filter((m) => m.team === 'B').map(toDto).sort(sortFn);
    return { rosterA, rosterB };
  }

  private gameServerFromMatch(match: Match): MatchGameServerDto | null {
    const host = match.gameServerHost?.trim();
    if (!host || match.gamePort == null) {
      return null;
    }
    return {
      host,
      gamePort: match.gamePort,
      tvPort: match.tvPort,
      connectCommand:
        match.connectCommand?.trim() ?? `connect ${host}:${match.gamePort}`,
    };
  }

  private async loadTournamentRosters(
    teamAId: string | undefined,
    teamBId: string | undefined,
    viewerSteamId: string,
  ): Promise<{
    rosterA: MatchVetoRosterMemberDto[];
    rosterB: MatchVetoRosterMemberDto[];
  }> {
    if (!teamAId || !teamBId) {
      return { rosterA: [], rosterB: [] };
    }
    const [rawA, rawB] = await Promise.all([
      this.membersRepo.find({ where: { teamId: teamAId } }),
      this.membersRepo.find({ where: { teamId: teamBId } }),
    ]);
    const sortedA = this.sortMembersForDisplay(rawA);
    const sortedB = this.sortMembersForDisplay(rawB);
    const avatarBySteam = await this.loadAvatarUrlsBySteamId([
      ...sortedA,
      ...sortedB,
    ]);
    return {
      rosterA: sortedA.map((m) =>
        this.mapRosterMember(m, viewerSteamId, avatarBySteam),
      ),
      rosterB: sortedB.map((m) =>
        this.mapRosterMember(m, viewerSteamId, avatarBySteam),
      ),
    };
  }

  private sortMembersForDisplay(members: readonly TeamMember[]): TeamMember[] {
    return [...members].sort((a, b) => {
      if (a.isCaptain !== b.isCaptain) {
        return a.isCaptain ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  private mapRosterMember(
    m: TeamMember,
    viewerSteamId: string,
    avatarBySteam: ReadonlyMap<string, string | null>,
  ): MatchVetoRosterMemberDto {
    return {
      id: m.id,
      name: m.name,
      isCaptain: m.isCaptain,
      avatarUrl: avatarBySteam.get(m.steamId) ?? null,
      isViewer: m.steamId === viewerSteamId,
    };
  }

  private async loadAvatarUrlsBySteamId(
    members: readonly TeamMember[],
  ): Promise<Map<string, string | null>> {
    const steamIds = [...new Set(members.map((x) => x.steamId).filter(Boolean))];
    if (steamIds.length === 0) {
      return new Map();
    }
    const rows = await this.usersRepo.find({
      where: { steamId: In(steamIds) },
      select: { steamId: true, avatarUrl: true },
    });
    return new Map(rows.map((u) => [u.steamId, u.avatarUrl ?? null]));
  }

  private async loadMatchForVeto(matchId: string): Promise<Match> {
    const match = await this.matchesRepo.findOne({
      where: { id: matchId },
      relations: ['teamA', 'teamB'],
    });
    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }
    return match;
  }

  private async resolveTeamMembership(
    steamId: string,
    teamAId: string | undefined,
    teamBId: string | undefined,
  ): Promise<Membership> {
    if (!teamAId || !teamBId) {
      return { isMember: false, teamSide: null, isCaptain: false };
    }
    const [aMem, bMem] = await Promise.all([
      this.membersRepo.findOne({ where: { teamId: teamAId, steamId } }),
      this.membersRepo.findOne({ where: { teamId: teamBId, steamId } }),
    ]);
    if (aMem) {
      return {
        isMember: true,
        teamSide: 'team_a',
        isCaptain: aMem.isCaptain,
      };
    }
    if (bMem) {
      return {
        isMember: true,
        teamSide: 'team_b',
        isCaptain: bMem.isCaptain,
      };
    }
    return { isMember: false, teamSide: null, isCaptain: false };
  }

  private async resolveLobbyMembership(
    lobbyId: string,
    viewerSteamId: string,
  ): Promise<Membership> {
    const user = await this.usersRepo.findOne({
      where: { steamId: viewerSteamId },
    });
    if (!user) {
      return { isMember: false, teamSide: null, isCaptain: false };
    }
    const member = await this.lobbyMembersRepo.findOne({
      where: { lobbyId, userId: user.id, leftAt: IsNull() },
    });
    if (!member) {
      return { isMember: false, teamSide: null, isCaptain: false };
    }
    const teamSide: 'team_a' | 'team_b' | null =
      member.team === 'A'
        ? 'team_a'
        : member.team === 'B'
          ? 'team_b'
          : null;
    return {
      isMember: teamSide != null,
      teamSide,
      isCaptain: member.role === 'HOST' || member.role === 'CAPTAIN',
    };
  }

  private buildViewer(
    steamId: string,
    membership: Membership,
    nextSide: 'team_a' | 'team_b' | null,
    status: MatchStatus,
  ): MatchVetoViewerDto {
    const canBanNow =
      status === MatchStatus.VETO_PHASE &&
      membership.isCaptain &&
      membership.teamSide != null &&
      membership.teamSide === nextSide;
    return {
      steamId,
      isMember: membership.teamSide != null,
      teamSide: membership.teamSide,
      isCaptain: membership.isCaptain,
      canBanNow,
    };
  }

  private stageLabelFromCode(code: string | null): string {
    if (!code) {
      return 'Match';
    }
    const u = code.toUpperCase();
    if (u.startsWith('PLAYOFF-M')) {
      const n = /^PLAYOFF-M(\d+)$/i.exec(code)?.[1];
      if (n === '1' || n === '2' || n === '3' || n === '4') {
        return 'Quarter Finals';
      }
      if (n === '5' || n === '6') {
        return 'Semi Finals';
      }
      if (n === '7') {
        return 'Grand Final';
      }
      return 'Playoffs';
    }
    if (/^ZONE-[ABCD]-/i.test(code)) {
      const g = /^ZONE-([ABCD])-/i.exec(code)?.[1];
      return g ? `Swiss · Group ${g.toUpperCase()}` : 'Swiss';
    }
    return 'Match';
  }

  private completeVetoIfDone(
    match: Match,
    format: MapVetoFormat,
    totalSteps: number,
    nextIndex: number,
  ): string | null {
    if (nextIndex < totalSteps) {
      return null;
    }
    const bans = [...(match.vetoBans ?? [])];
    const picks = [...(match.vetoPicks ?? [])];
    const decider = remainingMapAfterRemoved([...bans, ...picks]);
    if (!decider) {
      throw new BadRequestException('Could not resolve decider map after veto');
    }
    // For BO1 the decider is the one playable map; for BO3/BO5 the series is
    // `picks + decider` — the first map played is the first pick.
    const openingMap =
      format === 'bo1' ? decider : (picks[0]?.trim() ?? decider);
    match.mapName = openingMap;
    match.status = MatchStatus.CONFIGURING_SERVER;
    return openingMap;
  }

  /**
   * Mirrors the provisioning kickoff that used to live on `LobbyVetoService`:
   * creates a rental_server row and emits LOBBY_PROVISIONING_REQUESTED so the
   * provisioning service can drive the CS2 agent handshake.
   */
  private async handleLobbyVetoCompletion(
    em: EntityManager,
    match: Match,
    firstMap: string,
  ): Promise<void> {
    if (!match.lobbyId) {
      return;
    }
    const lobby = await em.findOne(Lobby, { where: { id: match.lobbyId } });
    if (!lobby) {
      throw new NotFoundException(`Lobby ${match.lobbyId} not found`);
    }

    let rental = await em.findOne(RentalServer, {
      where: { lobbyId: lobby.id, deletedAt: IsNull() },
    });
    const durationMinutes = Number(
      this.config.get<number>('LOBBY_DEFAULT_DURATION_MINUTES') ?? 180,
    );
    const endsAt = new Date(Date.now() + durationMinutes * 60_000);

    if (!rental) {
      rental = em.create(RentalServer, {
        lobbyId: lobby.id,
        matchId: match.id,
        status: 'PROVISIONING',
        host: null,
        port: null,
        gotvPort: null,
        connectString: null,
        startedAt: null,
        endsAt,
      });
      rental = await em.save(RentalServer, rental);
    } else {
      rental.matchId = match.id;
      rental.status = 'PROVISIONING';
      rental.endsAt = endsAt;
      rental.connectString = null;
      rental.host = null;
      rental.port = null;
      rental.gotvPort = null;
      rental = await em.save(RentalServer, rental);
    }

    lobby.rentalServerId = rental.id;
    await em.save(Lobby, lobby);

    const picks = [...(match.vetoPicks ?? [])];
    const decider = remainingMapAfterRemoved([
      ...(match.vetoBans ?? []),
      ...picks,
    ]);
    const seriesMaps = picks.length > 0 && decider ? [...picks, decider] : [firstMap];
    const payload: LobbyProvisioningRequestedEvent = {
      lobbyId: lobby.id,
      matchId: match.id,
      rentalServerId: rental.id,
      mode: lobby.mode,
      region: lobby.region,
      features: lobby.features,
      mapName: firstMap,
      seriesMapIndex: 0,
      isFinalMap: seriesMaps.length === 1,
      vetoSeriesMaps: seriesMaps,
      serverPassword: lobby.serverPassword,
    };
    this.events.emit(LOBBY_PROVISIONING_REQUESTED, payload);
    this.logger.log(
      `Lobby ${lobby.id} veto complete — provisioning match ${match.id} on ${firstMap} (${seriesMaps.length} map${seriesMaps.length === 1 ? '' : 's'})`,
    );
  }
}
