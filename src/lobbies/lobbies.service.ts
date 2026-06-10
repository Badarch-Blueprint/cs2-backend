import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { User } from '../users/user.entity';
import type { CreateLobbyDto } from './dto/create-lobby.dto';
import type {
  LobbyOptionsView,
  LobbyView,
} from './dto/lobby.view';
import { MoveMemberDto } from './dto/move-member.dto';
import { Lobby } from './entities/lobby.entity';
import { LobbyMember } from './entities/lobby-member.entity';
import { RentalServer } from './entities/rental-server.entity';
import { buildLobbyView } from './lobby-view.factory';
import { LobbyBroadcastService } from './lobby-broadcast.service';
import {
  ACTIVE_LOBBY_STATUSES,
  DEFAULT_LOBBY_FEATURES,
  LOBBY_TEAM_SIZE,
  type LobbyStatus,
  type LobbyTeam,
  type PlayingTeam,
} from './lobby.types';
import { generateUniqueInviteCode } from './invite-code';
import { cancelLinkedMatchIfOpen } from './lobby-match-cancel.util';

type Actor = {
  readonly userId: string;
  readonly steamId: string;
  readonly isAdmin: boolean;
};

@Injectable()
export class LobbiesService {
  private readonly logger = new Logger(LobbiesService.name);

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
    private readonly config: ConfigService,
    private readonly broadcast: LobbyBroadcastService,
  ) {}

  // ---------------------------------------------------------------- lookups

  async findById(lobbyId: string): Promise<Lobby> {
    const lobby = await this.lobbiesRepo.findOne({ where: { id: lobbyId } });
    if (!lobby || lobby.deletedAt) {
      throw new NotFoundException(`Lobby ${lobbyId} not found`);
    }
    return lobby;
  }

  async findByInviteCode(code: string): Promise<Lobby> {
    const lobby = await this.lobbiesRepo.findOne({ where: { inviteCode: code } });
    if (!lobby || lobby.deletedAt) {
      throw new NotFoundException(`Invite code not found`);
    }
    return lobby;
  }

  async listActiveMembers(lobbyId: string): Promise<LobbyMember[]> {
    return this.membersRepo.find({
      where: { lobbyId, leftAt: IsNull() },
      order: { joinedAt: 'ASC' },
    });
  }

  async assertMember(lobbyId: string, userId: string): Promise<LobbyMember> {
    const member = await this.membersRepo.findOne({
      where: { lobbyId, userId, leftAt: IsNull() },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this lobby');
    }
    return member;
  }

  async resolveUser(steamId: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { steamId } });
    if (!user) {
      throw new ForbiddenException('User not found');
    }
    return user;
  }

  async buildView(lobby: Lobby, viewer: { userId: string; isAdmin: boolean }): Promise<LobbyView> {
    const members = await this.listActiveMembers(lobby.id);
    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await this.usersRepo.find({ where: { id: In(userIds) } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const rentalServer = lobby.rentalServerId
      ? await this.serversRepo.findOne({ where: { id: lobby.rentalServerId } })
      : null;
    const isMember = members.some((m) => m.userId === viewer.userId);
    return buildLobbyView({
      lobby,
      members,
      users: userMap,
      rentalServer,
      includeServerSecrets: isMember || viewer.isAdmin,
    });
  }

  async listMine(userId: string): Promise<LobbyView[]> {
    const activeMemberships = await this.membersRepo.find({
      where: { userId, leftAt: IsNull() },
    });
    if (activeMemberships.length === 0) {
      return [];
    }
    const lobbyIds = [...new Set(activeMemberships.map((m) => m.lobbyId))];
    const lobbies = await this.lobbiesRepo.find({
      where: { id: In(lobbyIds) },
    });
    const filtered = lobbies.filter(
      (l) => !l.deletedAt && ACTIVE_LOBBY_STATUSES.includes(l.status),
    );
    return Promise.all(
      filtered.map((lobby) => this.buildView(lobby, { userId, isAdmin: false })),
    );
  }

  // --------------------------------------------------------------- creation

  async create(actor: Actor, dto: CreateLobbyDto): Promise<LobbyView> {
    const host = await this.usersRepo.findOne({ where: { id: actor.userId } });
    if (!host) {
      throw new ForbiddenException('Host user not found');
    }
    await this.ensureNoActiveLobby(actor.userId);

    const inviteCode = await generateUniqueInviteCode(async (candidate) => {
      const existing = await this.lobbiesRepo.findOne({
        where: { inviteCode: candidate },
      });
      return existing != null;
    });

    const ttlMinutes = Number(
      this.config.get<number>('LOBBY_TTL_MINUTES') ?? 120,
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

    const lobby = this.lobbiesRepo.create({
      inviteCode,
      hostUserId: host.id,
      mode: dto.mode,
      name: dto.name,
      region: dto.region,
      serverPassword: dto.serverPassword?.trim() ? dto.serverPassword.trim() : null,
      features: { ...DEFAULT_LOBBY_FEATURES, ...dto.features },
      status: 'WAITING',
      teamSize: LOBBY_TEAM_SIZE,
      expiresAt,
    });
    const saved = await this.lobbiesRepo.save(lobby);

    const hostMember = this.membersRepo.create({
      lobbyId: saved.id,
      userId: host.id,
      team: 'A',
      role: 'HOST',
      isReady: false,
      joinedAt: now,
      leftAt: null,
    });
    await this.membersRepo.save(hostMember);

    this.broadcast.emit(saved.id, 'lobby.updated', await this.buildView(saved, { userId: host.id, isAdmin: false }));
    return this.buildView(saved, { userId: host.id, isAdmin: actor.isAdmin });
  }

  // ---------------------------------------------------------------- joining

  async join(
    actor: Actor,
    lobbyId: string,
    preferredTeam?: PlayingTeam,
  ): Promise<LobbyView> {
    const lobby = await this.findById(lobbyId);
    if (lobby.status !== 'WAITING') {
      throw new BadRequestException('Lobby is not accepting new members');
    }

    const existing = await this.membersRepo.findOne({
      where: { lobbyId, userId: actor.userId, leftAt: IsNull() },
    });
    if (existing) {
      return this.buildView(lobby, { userId: actor.userId, isAdmin: actor.isAdmin });
    }

    await this.autoLeaveOtherWaitingLobbies(actor.userId, lobbyId);

    const members = await this.listActiveMembers(lobbyId);
    const team = this.chooseTeamForJoin(members, preferredTeam);
    const role = this.chooseRoleForJoin(members, team);

    const member = this.membersRepo.create({
      lobbyId,
      userId: actor.userId,
      team,
      role,
      isReady: false,
      joinedAt: new Date(),
      leftAt: null,
    });
    await this.membersRepo.save(member);

    const view = await this.buildView(lobby, { userId: actor.userId, isAdmin: actor.isAdmin });
    this.broadcast.emit(lobby.id, 'lobby.member.joined', {
      member: view.members.find((m) => m.userId === actor.userId),
    });
    this.broadcast.emit(lobby.id, 'lobby.updated', view);
    return view;
  }

  private chooseTeamForJoin(
    members: readonly LobbyMember[],
    preferredTeam: PlayingTeam | undefined,
  ): LobbyTeam {
    const countA = members.filter((m) => m.team === 'A').length;
    const countB = members.filter((m) => m.team === 'B').length;
    if (preferredTeam === 'A' && countA < LOBBY_TEAM_SIZE) {
      return 'A';
    }
    if (preferredTeam === 'B' && countB < LOBBY_TEAM_SIZE) {
      return 'B';
    }
    if (countA < LOBBY_TEAM_SIZE && countA <= countB) {
      return 'A';
    }
    if (countB < LOBBY_TEAM_SIZE) {
      return 'B';
    }
    return 'SPECTATOR';
  }

  private chooseRoleForJoin(
    members: readonly LobbyMember[],
    team: LobbyTeam,
  ): 'CAPTAIN' | 'MEMBER' {
    if (team === 'SPECTATOR') {
      return 'MEMBER';
    }
    const hasCaptain = members.some(
      (m) => m.team === team && (m.role === 'HOST' || m.role === 'CAPTAIN'),
    );
    return hasCaptain ? 'MEMBER' : 'CAPTAIN';
  }

  private async autoLeaveOtherWaitingLobbies(
    userId: string,
    exceptLobbyId: string,
  ): Promise<void> {
    const memberships = await this.membersRepo.find({
      where: { userId, leftAt: IsNull() },
    });
    for (const m of memberships) {
      if (m.lobbyId === exceptLobbyId) {
        continue;
      }
      const otherLobby = await this.lobbiesRepo.findOne({
        where: { id: m.lobbyId },
      });
      if (otherLobby?.status === 'WAITING') {
        await this.internalLeave(otherLobby, m, 'left');
      }
    }
  }

  // --------------------------------------------------------------- leaving

  async leave(actor: Actor, lobbyId: string): Promise<{ ok: true }> {
    const lobby = await this.findById(lobbyId);
    const member = await this.assertMember(lobbyId, actor.userId);
    await this.internalLeave(lobby, member, 'left');
    return { ok: true };
  }

  async kick(actor: Actor, lobbyId: string, targetUserId: string): Promise<LobbyView> {
    const lobby = await this.findById(lobbyId);
    await this.assertHost(lobby, actor.userId);
    if (targetUserId === actor.userId) {
      throw new BadRequestException('Host cannot kick themselves; use /cancel or /leave');
    }
    const member = await this.membersRepo.findOne({
      where: { lobbyId, userId: targetUserId, leftAt: IsNull() },
    });
    if (!member) {
      throw new NotFoundException('Target is not an active member');
    }
    await this.internalLeave(lobby, member, 'kicked', actor.userId);
    return this.buildView(
      await this.findById(lobbyId),
      { userId: actor.userId, isAdmin: actor.isAdmin },
    );
  }

  private async internalLeave(
    lobby: Lobby,
    member: LobbyMember,
    reason: 'left' | 'kicked' | 'host_transfer',
    byUserId?: string,
  ): Promise<void> {
    member.leftAt = new Date();
    member.isReady = false;
    await this.membersRepo.save(member);

    this.broadcast.emit(lobby.id, 'lobby.member.left', {
      userId: member.userId,
      reason,
    });
    if (reason === 'kicked') {
      this.broadcast.emit(lobby.id, 'lobby.member.kicked', {
        userId: member.userId,
        byUserId: byUserId ?? null,
      });
    }

    if (member.userId === lobby.hostUserId) {
      await this.transferHostOrCancel(lobby);
    } else if (lobby.status === 'READY_CHECK') {
      await this.revertReadyCheckToWaiting(lobby);
    }

    const freshLobby = await this.findById(lobby.id);
    if (!freshLobby.deletedAt && freshLobby.status !== 'CANCELLED') {
      const view = await this.buildView(freshLobby, {
        userId: lobby.hostUserId,
        isAdmin: false,
      });
      this.broadcast.emit(lobby.id, 'lobby.updated', view);
    }
  }

  private async transferHostOrCancel(lobby: Lobby): Promise<void> {
    const candidates = await this.membersRepo.find({
      where: { lobbyId: lobby.id, leftAt: IsNull() },
      order: { joinedAt: 'ASC' },
    });
    const captainA = candidates.find((m) => m.team === 'A' && m.role === 'CAPTAIN');
    const captainB = candidates.find((m) => m.team === 'B' && m.role === 'CAPTAIN');
    const fallback = candidates.find(
      (m) => m.team === 'A' || m.team === 'B',
    );
    const newHost = captainA ?? captainB ?? fallback;
    if (!newHost) {
      await this.cancelInternal(lobby, 'host_left');
      return;
    }
    lobby.hostUserId = newHost.userId;
    await this.lobbiesRepo.save(lobby);
    newHost.role = 'HOST';
    newHost.team = 'A';
    await this.membersRepo.save(newHost);
    this.broadcast.emit(lobby.id, 'lobby.member.teamChanged', {
      userId: newHost.userId,
      team: newHost.team,
      role: newHost.role,
    });
  }

  private async revertReadyCheckToWaiting(lobby: Lobby): Promise<void> {
    const prev = lobby.status;
    lobby.status = 'WAITING';
    await this.lobbiesRepo.save(lobby);
    this.broadcast.emit(lobby.id, 'lobby.status.changed', {
      from: prev,
      to: 'WAITING',
    });
  }

  // --------------------------------------------------------------- move / ready

  async move(actor: Actor, lobbyId: string, dto: MoveMemberDto): Promise<LobbyView> {
    const lobby = await this.findById(lobbyId);
    await this.assertHost(lobby, actor.userId);
    if (lobby.status !== 'WAITING' && lobby.status !== 'READY_CHECK') {
      throw new BadRequestException('Members can only be moved before veto');
    }
    const target = await this.membersRepo.findOne({
      where: { lobbyId, userId: dto.userId, leftAt: IsNull() },
    });
    if (!target) {
      throw new NotFoundException('Target is not an active member');
    }
    if (dto.team !== 'SPECTATOR') {
      const teamCount = await this.membersRepo.count({
        where: { lobbyId, team: dto.team, leftAt: IsNull() },
      });
      const currentlyOnTargetTeam = target.team === dto.team;
      if (!currentlyOnTargetTeam && teamCount >= LOBBY_TEAM_SIZE) {
        throw new BadRequestException(`Team ${dto.team} is full`);
      }
    }

    target.team = dto.team;
    if (dto.team === 'SPECTATOR') {
      target.role = 'MEMBER';
      target.isReady = false;
    } else if (dto.promoteCaptain) {
      await this.demoteExistingCaptain(lobbyId, dto.team);
      target.role = 'CAPTAIN';
    } else if (target.role === 'CAPTAIN') {
      // moving a captain to the other team; strip captain unless promoted there
      target.role = 'MEMBER';
    }

    await this.membersRepo.save(target);
    this.broadcast.emit(lobby.id, 'lobby.member.teamChanged', {
      userId: target.userId,
      team: target.team,
      role: target.role,
    });

    if (lobby.status === 'READY_CHECK') {
      await this.revertReadyCheckToWaiting(lobby);
    }

    const view = await this.buildView(
      await this.findById(lobbyId),
      { userId: actor.userId, isAdmin: actor.isAdmin },
    );
    this.broadcast.emit(lobby.id, 'lobby.updated', view);
    return view;
  }

  private async demoteExistingCaptain(
    lobbyId: string,
    team: LobbyTeam,
  ): Promise<void> {
    const captains = await this.membersRepo.find({
      where: { lobbyId, team, role: 'CAPTAIN', leftAt: IsNull() },
    });
    for (const c of captains) {
      c.role = 'MEMBER';
      await this.membersRepo.save(c);
    }
  }

  async toggleReady(
    actor: Actor,
    lobbyId: string,
    ready: boolean,
  ): Promise<LobbyView> {
    const lobby = await this.findById(lobbyId);
    if (lobby.status !== 'WAITING' && lobby.status !== 'READY_CHECK') {
      throw new BadRequestException('Ready state can only change before veto');
    }
    const member = await this.assertMember(lobbyId, actor.userId);
    if (member.team === 'SPECTATOR') {
      throw new BadRequestException('Spectators cannot set ready state');
    }
    member.isReady = ready;
    await this.membersRepo.save(member);
    this.broadcast.emit(lobby.id, 'lobby.member.readyChanged', {
      userId: member.userId,
      isReady: ready,
    });

    if (!ready && lobby.status === 'READY_CHECK') {
      await this.revertReadyCheckToWaiting(lobby);
    }

    const view = await this.buildView(
      await this.findById(lobbyId),
      { userId: actor.userId, isAdmin: actor.isAdmin },
    );
    this.broadcast.emit(lobby.id, 'lobby.updated', view);
    return view;
  }

  // --------------------------------------------------------------- start / cancel

  /**
   * Transitions WAITING → READY_CHECK once both teams have at least one
   * player and not everyone is ready yet; when every A/B member is already
   * ready, creates the match row (status=VETO_PHASE) and goes straight to
   * STARTED in one call. From then on the linked match owns veto/server/live
   * state — the lobby just holds a pointer to it.
   */
  async start(actor: Actor, lobbyId: string): Promise<{
    lobby: Lobby;
    transitionedToStarted: boolean;
    matchId: string | null;
  }> {
    const lobby = await this.findById(lobbyId);
    await this.assertHost(lobby, actor.userId);
    if (lobby.status !== 'WAITING' && lobby.status !== 'READY_CHECK') {
      throw new BadRequestException('Lobby has already started');
    }
    const members = await this.listActiveMembers(lobbyId);
    const teamA = members.filter((m) => m.team === 'A');
    const teamB = members.filter((m) => m.team === 'B');
    if (teamA.length < 1 || teamB.length < 1) {
      throw new BadRequestException(
        'Both teams need at least one player before starting',
      );
    }

    const everybodyReady = [...teamA, ...teamB].every((m) => m.isReady);
    const prev = lobby.status;
    if (!everybodyReady) {
      lobby.status = 'READY_CHECK';
      await this.lobbiesRepo.save(lobby);
      if (prev !== 'READY_CHECK') {
        this.broadcast.emit(lobby.id, 'lobby.status.changed', {
          from: prev,
          to: 'READY_CHECK',
        });
      }
      return { lobby, transitionedToStarted: false, matchId: null };
    }

    const matchId = await this.createMatchOnStart(lobby);
    lobby.status = 'STARTED';
    await this.lobbiesRepo.save(lobby);
    this.broadcast.emit(lobby.id, 'lobby.status.changed', {
      from: prev,
      to: 'STARTED',
    });
    this.broadcast.emit(lobby.id, 'lobby.match.created', { matchId });
    return { lobby, transitionedToStarted: true, matchId };
  }

  async cancel(actor: Actor, lobbyId: string): Promise<{ ok: true }> {
    const lobby = await this.findById(lobbyId);
    await this.assertHost(lobby, actor.userId);
    if (lobby.status === 'CANCELLED' || lobby.status === 'EXPIRED') {
      throw new BadRequestException('Lobby is already closed');
    }
    await this.cancelInternal(lobby, 'host');
    return { ok: true };
  }

  async cancelInternal(lobby: Lobby, reason: string): Promise<void> {
    const prev = lobby.status;
    lobby.status = 'CANCELLED';
    await this.lobbiesRepo.save(lobby);
    await cancelLinkedMatchIfOpen(this.matchesRepo, lobby);
    const activeMembers = await this.listActiveMembers(lobby.id);
    const leftAt = new Date();
    for (const m of activeMembers) {
      m.leftAt = leftAt;
      m.isReady = false;
    }
    if (activeMembers.length) {
      await this.membersRepo.save(activeMembers);
    }
    this.broadcast.emit(lobby.id, 'lobby.status.changed', {
      from: prev,
      to: 'CANCELLED',
    });
    this.broadcast.emit(lobby.id, 'lobby.cancelled', { reason });
  }

  // --------------------------------------------------------------- invites

  async rotateInvite(actor: Actor, lobbyId: string): Promise<LobbyView> {
    const lobby = await this.findById(lobbyId);
    await this.assertHost(lobby, actor.userId);
    lobby.inviteCode = await generateUniqueInviteCode(async (candidate) => {
      const existing = await this.lobbiesRepo.findOne({
        where: { inviteCode: candidate },
      });
      return existing != null && existing.id !== lobby.id;
    });
    await this.lobbiesRepo.save(lobby);
    const view = await this.buildView(lobby, { userId: actor.userId, isAdmin: actor.isAdmin });
    this.broadcast.emit(lobby.id, 'lobby.updated', view);
    return view;
  }

  // --------------------------------------------------------------- options

  options(): LobbyOptionsView {
    return {
      regions: [{ value: 'MN', label: 'Mongolia', available: true }],
      features: [
        { key: 'cstv', label: 'CSTV Link', available: true },
        { key: 'demo', label: 'Demo mode', available: true },
        { key: 'skinChanger', label: 'Skin changer', available: false },
        { key: 'highLight', label: 'Highlight', available: true },
      ],
      modes: ['BO3', 'BO5', 'TOURNAMENT'],
    };
  }

  // --------------------------------------------------------------- admin

  async adminList(filters: {
    status?: LobbyStatus;
    hostUserId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ lobbies: LobbyView[]; total: number }> {
    const qb = this.lobbiesRepo.createQueryBuilder('l')
      .where('l.deletedAt IS NULL')
      .orderBy('l.createdAt', 'DESC')
      .take(filters.limit ?? 50)
      .skip(filters.offset ?? 0);
    if (filters.status) {
      qb.andWhere('l.status = :status', { status: filters.status });
    }
    if (filters.hostUserId) {
      qb.andWhere('l.hostUserId = :hostUserId', { hostUserId: filters.hostUserId });
    }
    const [rows, total] = await qb.getManyAndCount();
    const views = await Promise.all(
      rows.map((l) =>
        this.buildView(l, { userId: '__admin__', isAdmin: true }),
      ),
    );
    return { lobbies: views, total };
  }

  async adminForceStatus(
    lobbyId: string,
    status: LobbyStatus,
    reason: string | null,
  ): Promise<LobbyView> {
    const lobby = await this.findById(lobbyId);
    const prev = lobby.status;
    lobby.status = status;
    await this.lobbiesRepo.save(lobby);
    this.broadcast.emit(lobby.id, 'lobby.status.changed', {
      from: prev,
      to: status,
    });
    if (status === 'CANCELLED' || status === 'EXPIRED') {
      const activeMembers = await this.listActiveMembers(lobby.id);
      const leftAt = new Date();
      for (const m of activeMembers) {
        m.leftAt = leftAt;
      }
      if (activeMembers.length) {
        await this.membersRepo.save(activeMembers);
      }
      await cancelLinkedMatchIfOpen(this.matchesRepo, lobby);
      this.broadcast.emit(lobby.id, 'lobby.cancelled', {
        reason: reason ?? `admin_${status.toLowerCase()}`,
      });
    }
    const view = await this.buildView(lobby, { userId: '__admin__', isAdmin: true });
    this.broadcast.emit(lobby.id, 'lobby.updated', view);
    return view;
  }

  // --------------------------------------------------------------- helpers

  private async ensureNoActiveLobby(userId: string): Promise<void> {
    const hosted = await this.lobbiesRepo.findOne({
      where: {
        hostUserId: userId,
        deletedAt: IsNull(),
        status: In([...ACTIVE_LOBBY_STATUSES]),
      },
    });
    if (hosted) {
      throw new BadRequestException(
        'You already host an active lobby; cancel it before creating a new one',
      );
    }
  }

  private async assertHost(lobby: Lobby, userId: string): Promise<void> {
    if (lobby.hostUserId !== userId) {
      throw new ForbiddenException('Only the lobby host may perform this action');
    }
  }

  /**
   * Creates the {@link Match} row that the lobby hands off to on `start`. The
   * match row owns all subsequent veto + server + live state; `lobby.matchId`
   * is the only link.
   */
  private async createMatchOnStart(lobby: Lobby): Promise<string> {
    if (lobby.matchId) {
      return lobby.matchId;
    }
    const now = new Date();
    const match = this.matchesRepo.create({
      code: `Lobby-${lobby.inviteCode}`,
      status: MatchStatus.VETO_PHASE,
      teamA: null,
      teamB: null,
      scoreA: null,
      scoreB: null,
      mapName: null,
      vetoBans: [],
      vetoPicks: [],
      vetoPickSides: [],
      startAt: now,
      endAt: null,
      lobbyId: lobby.id,
    });
    const saved = await this.matchesRepo.save(match);
    lobby.matchId = saved.id;
    this.logger.debug(`Lobby ${lobby.id} bound to match ${saved.id} on start`);
    return saved.id;
  }

}
