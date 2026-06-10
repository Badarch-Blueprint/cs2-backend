import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { Team } from '../teams/team.entity';

/** Matches counted and listed as “live” on the admin overview. */
const LIVE_BOARD_STATUSES: readonly MatchStatus[] = [
  MatchStatus.WAITING_FOR_PLAYERS,
  MatchStatus.VETO_PHASE,
  MatchStatus.CONFIGURING_SERVER,
  MatchStatus.LIVE,
];

export type AdminOverviewStatsDto = {
  totalTeams: number;
  totalMatches: number;
  liveMatchCount: number;
};

export type AdminOverviewLiveMatchDto = {
  id: string;
  phase: string;
  matchup: string;
  score: string;
};

export type AdminOverviewDto = {
  stats: AdminOverviewStatsDto;
  liveMatches: AdminOverviewLiveMatchDto[];
};

function phaseLabel(status: MatchStatus): string {
  switch (status) {
    case MatchStatus.WAITING_FOR_PLAYERS:
      return 'Lobby';
    case MatchStatus.VETO_PHASE:
      return 'Veto';
    case MatchStatus.CONFIGURING_SERVER:
      return 'Server';
    case MatchStatus.LIVE:
      return 'Live';
    case MatchStatus.SCHEDULED:
      return 'Scheduled';
    case MatchStatus.FINISHED:
      return 'Finished';
    case MatchStatus.CANCELLED:
      return 'Cancelled';
    default:
      return String(status);
  }
}

function scoreLine(m: Match): string {
  if (m.scoreA != null && m.scoreB != null) {
    return `${m.scoreA} – ${m.scoreB}`;
  }
  return '—';
}

@Injectable()
export class AdminOverviewService {
  constructor(
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    @InjectRepository(Team)
    private readonly teamsRepo: Repository<Team>,
  ) {}

  async getOverview(): Promise<AdminOverviewDto> {
    const [totalTeams, totalMatches, liveMatchCount, liveRows] = await Promise.all([
      this.teamsRepo.count(),
      this.matchesRepo.count(),
      this.matchesRepo.count({
        where: { status: In([...LIVE_BOARD_STATUSES]) },
      }),
      this.matchesRepo.find({
        where: { status: In([...LIVE_BOARD_STATUSES]) },
        relations: { teamA: true, teamB: true },
        order: { startAt: 'DESC' },
        take: 25,
      }),
    ]);

    const liveMatches: AdminOverviewLiveMatchDto[] = liveRows.map((m) => ({
      id: m.id,
      phase: phaseLabel(m.status),
      matchup: `${m.teamA?.name ?? 'TBD'} vs ${m.teamB?.name ?? 'TBD'}`,
      score: scoreLine(m),
    }));

    return {
      stats: {
        totalTeams,
        totalMatches,
        liveMatchCount,
      },
      liveMatches,
    };
  }
}
