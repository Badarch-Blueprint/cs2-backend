import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';

import type { BracketGroupCode } from '../brackets/bracket.constants';
import { BRACKET_GROUP_CODES } from '../brackets/bracket.constants';
import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { TeamMember } from '../teams/team-member.entity';
import { User } from '../users/user.entity';

const ZONE_GROUP_PREFIX = /^Zone-([ABCD])-/i;

/** Shown on the player dashboard as “in progress”. */
const LIVE_OR_ACTIVE: readonly MatchStatus[] = [
  MatchStatus.WAITING_FOR_PLAYERS,
  MatchStatus.VETO_PHASE,
  MatchStatus.CONFIGURING_SERVER,
  MatchStatus.LIVE,
];

export type DashboardTeamMemberDto = {
  id: string;
  name: string;
  isCaptain: boolean;
  /** Steam profile image URL when linked user row exists. */
  avatarUrl: string | null;
};

export type DashboardTeamSummaryDto = {
  id: string;
  name: string;
  members: DashboardTeamMemberDto[];
  viewerRole?: 'captain' | 'member';
};

export type DashboardLiveMatchDto = {
  id: string;
  code: string;
  status: string;
  teamAName: string;
  teamBName: string;
  groupCode?: string;
  roundNumber?: number;
};

export type DashboardUpcomingMatchDto = DashboardLiveMatchDto & {
  scheduledAt?: string | null;
};

export type DashboardRecentMatchDto = {
  id: string;
  code: string;
  opponentName: string;
  scoreLabel?: string | null;
  mapName?: string | null;
  playedAt: string;
  result: 'win' | 'loss' | 'draw';
};

export type DashboardTournamentDto = {
  id: string;
  name: string;
  status: string;
};

export type DashboardSummaryDto = {
  team: DashboardTeamSummaryDto | null;
  liveMatches: DashboardLiveMatchDto[];
  upcomingMatches: DashboardUpcomingMatchDto[];
  recentMatches: DashboardRecentMatchDto[];
  activeTournaments: DashboardTournamentDto[];
};

export type MatchListItemDto = {
  id: string;
  code: string;
  status: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  groupCode?: string;
  roundNumber?: number;
  scheduledAt?: string | null;
  mapName?: string | null;
  scoreSummary?: string | null;
};

export type MatchesListResponseDto = {
  matches: MatchListItemDto[];
};

function parseZoneMeta(code: string | null): {
  group?: BracketGroupCode;
  roundNumber?: number;
} {
  if (!code) {
    return {};
  }
  const g = ZONE_GROUP_PREFIX.exec(code);
  if (!g?.[1]) {
    return {};
  }
  const group = g[1].toUpperCase() as BracketGroupCode;
  if (!BRACKET_GROUP_CODES.includes(group)) {
    return {};
  }
  const m = /^Zone-[ABCD]-R(\d+)-M(\d+)$/i.exec(code);
  const roundNumber = m?.[1] ? Number(m[1]) : undefined;
  return { group, roundNumber };
}

function scoreLabel(m: Match): string | null {
  if (m.scoreA != null && m.scoreB != null) {
    return `${m.scoreA}–${m.scoreB}`;
  }
  return null;
}

@Injectable()
export class PlayerDashboardService {
  constructor(
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    @InjectRepository(TeamMember)
    private readonly teamMembersRepo: Repository<TeamMember>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async getSummary(steamId: string): Promise<DashboardSummaryDto> {
    const membership = await this.teamMembersRepo.findOne({
      where: { steamId },
      relations: { team: { members: true } },
    });

    const avatarBySteam = await this.loadAvatarUrlsBySteamId(
      membership?.team?.members ?? [],
    );
    const team = membership
      ? this.mapTeamSummary(membership, avatarBySteam)
      : null;
    const teamId = membership?.teamId ?? null;

    const [liveMatches, upcomingMatches, recentMatches] = await Promise.all([
      this.loadLiveMatches(),
      teamId ? this.loadUpcomingForTeam(teamId) : Promise.resolve([]),
      teamId ? this.loadRecentForTeam(teamId) : Promise.resolve([]),
    ]);

    return {
      team,
      liveMatches,
      upcomingMatches,
      recentMatches,
      activeTournaments: [],
    };
  }

  async listMatches(filters: {
    status?: string;
    group?: string;
  }): Promise<MatchesListResponseDto> {
    const qb = this.matchesRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.teamA', 'teamA')
      .leftJoinAndSelect('m.teamB', 'teamB')
      .where('m.code IS NOT NULL')
      .andWhere(
        new Brackets((w) => {
          w.where('m.code LIKE :zone', { zone: 'Zone-%' }).orWhere(
            'm.code LIKE :playoff',
            { playoff: 'Playoff-%' },
          );
        }),
      );

    const st = filters.status?.toUpperCase();
    if (st && st !== 'ALL') {
      if (st === 'LIVE') {
        qb.andWhere('m.status IN (:...live)', {
          live: [...LIVE_OR_ACTIVE],
        });
      } else if (st === 'SCHEDULED' || st === 'UPCOMING') {
        qb.andWhere('m.status = :sched', { sched: MatchStatus.SCHEDULED });
      } else if (st === 'COMPLETED' || st === 'FINISHED') {
        qb.andWhere('m.status = :fin', { fin: MatchStatus.FINISHED });
      } else if (filters.status) {
        qb.andWhere('m.status = :st', { st: filters.status });
      }
    }

    const gr = filters.group?.toUpperCase();
    if (gr && gr !== 'ALL' && /^[ABCD]$/.test(gr)) {
      qb.andWhere('m.code LIKE :gpre', { gpre: `Zone-${gr}-%` });
    }

    qb.orderBy('m.startAt', 'ASC').addOrderBy('m.code', 'ASC');

    const rows = await qb.getMany();
    return { matches: rows.map((r) => this.toMatchListItem(r)) };
  }

  private async loadAvatarUrlsBySteamId(
    members: readonly TeamMember[],
  ): Promise<Map<string, string | null>> {
    const steamIds = [...new Set(members.map((m) => m.steamId).filter(Boolean))];
    if (steamIds.length === 0) {
      return new Map();
    }
    const rows = await this.usersRepo.find({
      where: { steamId: In(steamIds) },
      select: { steamId: true, avatarUrl: true },
    });
    return new Map(rows.map((u) => [u.steamId, u.avatarUrl ?? null]));
  }

  private mapTeamSummary(
    membership: TeamMember,
    avatarBySteam: ReadonlyMap<string, string | null>,
  ): DashboardTeamSummaryDto {
    const t = membership.team;
    const members = (t.members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      isCaptain: m.isCaptain,
      avatarUrl: avatarBySteam.get(m.steamId) ?? null,
    }));
    return {
      id: t.id,
      name: t.name,
      members,
      viewerRole: membership.isCaptain ? 'captain' : 'member',
    };
  }

  private async loadLiveMatches(): Promise<DashboardLiveMatchDto[]> {
    const rows = await this.matchesRepo.find({
      where: { status: In([...LIVE_OR_ACTIVE]) },
      relations: { teamA: true, teamB: true },
      order: { startAt: 'ASC' },
    });
    return rows
      .filter((r) => this.isBracketCode(r.code))
      .map((r) => this.toLiveDto(r));
  }

  private async loadUpcomingForTeam(
    teamId: string,
  ): Promise<DashboardUpcomingMatchDto[]> {
    const now = new Date();
    const rows = await this.matchesRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.teamA', 'teamA')
      .leftJoinAndSelect('m.teamB', 'teamB')
      .where('m.status = :st', { st: MatchStatus.SCHEDULED })
      .andWhere('m.startAt >= :now', { now })
      .andWhere('(teamA.id = :tid OR teamB.id = :tid)', { tid: teamId })
      .andWhere(
        new Brackets((w) => {
          w.where('m.code LIKE :zone', { zone: 'Zone-%' }).orWhere(
            'm.code LIKE :playoff',
            { playoff: 'Playoff-%' },
          );
        }),
      )
      .orderBy('m.startAt', 'ASC')
      .take(20)
      .getMany();

    return rows.map((r) => ({
      ...this.toLiveDto(r),
      scheduledAt: r.startAt.toISOString(),
    }));
  }

  private async loadRecentForTeam(teamId: string): Promise<DashboardRecentMatchDto[]> {
    const rows = await this.matchesRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.teamA', 'teamA')
      .leftJoinAndSelect('m.teamB', 'teamB')
      .where('m.status = :st', { st: MatchStatus.FINISHED })
      .andWhere('(teamA.id = :tid OR teamB.id = :tid)', { tid: teamId })
      .andWhere(
        new Brackets((w) => {
          w.where('m.code LIKE :zone', { zone: 'Zone-%' }).orWhere(
            'm.code LIKE :playoff',
            { playoff: 'Playoff-%' },
          );
        }),
      )
      .orderBy('m.endAt', 'DESC', 'NULLS LAST')
      .addOrderBy('m.startAt', 'DESC')
      .take(25)
      .getMany();

    return rows.map((r) => this.toRecentDto(r, teamId));
  }

  private isBracketCode(code: string | null): boolean {
    if (!code) {
      return false;
    }
    return code.startsWith('Zone-') || code.startsWith('Playoff-');
  }

  private toLiveDto(m: Match): DashboardLiveMatchDto {
    const meta = parseZoneMeta(m.code);
    return {
      id: m.id,
      code: m.code ?? '',
      status: m.status,
      teamAName: m.teamA?.name ?? 'TBD',
      teamBName: m.teamB?.name ?? 'TBD',
      groupCode: meta.group,
      roundNumber: meta.roundNumber,
    };
  }

  private toMatchListItem(m: Match): MatchListItemDto {
    const meta = parseZoneMeta(m.code);
    return {
      id: m.id,
      code: m.code ?? '',
      status: m.status,
      teamAId: m.teamA?.id ?? '',
      teamBId: m.teamB?.id ?? '',
      teamAName: m.teamA?.name ?? 'TBD',
      teamBName: m.teamB?.name ?? 'TBD',
      groupCode: meta.group,
      roundNumber: meta.roundNumber,
      scheduledAt: m.startAt.toISOString(),
      mapName: m.mapName ?? null,
      scoreSummary: scoreLabel(m),
    };
  }

  private toRecentDto(m: Match, viewerTeamId: string): DashboardRecentMatchDto {
    const isA = m.teamA?.id === viewerTeamId;
    const opponentName = isA
      ? (m.teamB?.name ?? 'Unknown')
      : (m.teamA?.name ?? 'Unknown');
    const sa = m.scoreA;
    const sb = m.scoreB;
    let result: 'win' | 'loss' | 'draw' = 'draw';
    if (sa != null && sb != null) {
      const my = isA ? sa : sb;
      const theirs = isA ? sb : sa;
      if (my > theirs) {
        result = 'win';
      } else if (my < theirs) {
        result = 'loss';
      } else {
        result = 'draw';
      }
    }
    const playedAt = (m.endAt ?? m.startAt).toISOString();
    return {
      id: m.id,
      code: m.code ?? '',
      opponentName,
      scoreLabel: scoreLabel(m),
      mapName: m.mapName ?? null,
      playedAt,
      result,
    };
  }
}
