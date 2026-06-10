import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { BracketTeam } from '../brackets/bracket-team.entity';
import type { BracketGroupCode } from '../brackets/bracket.constants';
import { BRACKET_GROUP_CODES } from '../brackets/bracket.constants';
import { Match } from './match.entity';
import { MatchStatus } from './match-status.enum';
import { Team } from '../teams/team.entity';
import type { SetZoneScheduleDto } from './dto/set-zone-schedule.dto';
import { buildZoneRoundRobin } from './round-robin';
import type { ZoneRoundPlan } from './round-robin';

const NEW_CODE_RE = /^Zone-([ABCD])-R(\d+)-M(\d+)$/;

export type ZoneMatchViewDto = {
  id: string;
  code: string;
  status: MatchStatus;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  /** Map name after veto or assignment. */
  mapName: string | null;
  /** Final map rounds (e.g. 13 vs 8); null until recorded. */
  scoreA: number | null;
  scoreB: number | null;
};

export type ZoneRoundViewDto = {
  roundNumber: number;
  matches: ZoneMatchViewDto[];
  bye: { teamId: string; teamName: string } | null;
};

export type ZoneMatchesGroupDto = {
  rounds: ZoneRoundViewDto[];
};

export type AllZoneMatchesDto = Record<BracketGroupCode, ZoneMatchesGroupDto>;

@Injectable()
export class ZoneMatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    @InjectRepository(BracketTeam)
    private readonly bracketTeamsRepo: Repository<BracketTeam>,
  ) {}

  private zoneCodePrefix(group: BracketGroupCode): string {
    return `Zone-${group}-`;
  }

  private matchCode(
    group: BracketGroupCode,
    round: number,
    matchInRound: number,
  ): string {
    return `${this.zoneCodePrefix(group)}R${round}-M${matchInRound}`;
  }

  async listAllZoneMatches(): Promise<AllZoneMatchesDto> {
    const out = {} as AllZoneMatchesDto;
    for (const g of BRACKET_GROUP_CODES) {
      out[g] = await this.listZoneMatchesForGroup(g);
    }
    return out;
  }

  async listZoneMatchesForGroup(
    group: BracketGroupCode,
  ): Promise<ZoneMatchesGroupDto> {
    const prefix = this.zoneCodePrefix(group);
    const rows = await this.matchesRepo.find({
      where: { code: Like(`${prefix}%`) },
      relations: ['teamA', 'teamB'],
      order: { code: 'ASC' },
    });

    type RowMeta = {
      row: Match;
      view: ZoneMatchViewDto;
      round: number;
      matchOrder: number;
    };

    const meta: RowMeta[] = [];
    for (const r of rows) {
      const code = r.code ?? '';
      const m = NEW_CODE_RE.exec(code);
      if (m?.[1] === group && m[2] && m[3]) {
        meta.push({
          row: r,
          view: {
            id: r.id,
            code,
            status: r.status,
            teamAId: r.teamA?.id ?? '',
            teamBId: r.teamB?.id ?? '',
            teamAName: r.teamA?.name ?? '—',
            teamBName: r.teamB?.name ?? '—',
            mapName: r.mapName ?? null,
            scoreA: r.scoreA ?? null,
            scoreB: r.scoreB ?? null,
          },
          round: Number(m[2]),
          matchOrder: Number(m[3]),
        });
      } else {
        const legacy = /^Zone-[ABCD]-Match-(\d+)$/i.exec(code);
        if (legacy?.[1]) {
          meta.push({
            row: r,
            view: {
              id: r.id,
              code,
              status: r.status,
              teamAId: r.teamA?.id ?? '',
              teamBId: r.teamB?.id ?? '',
              teamAName: r.teamA?.name ?? '—',
              teamBName: r.teamB?.name ?? '—',
              mapName: r.mapName ?? null,
              scoreA: r.scoreA ?? null,
              scoreB: r.scoreB ?? null,
            },
            round: 1,
            matchOrder: Number(legacy[1]),
          });
        }
      }
    }

    const roundNums = [...new Set(meta.map((x) => x.round))].sort(
      (a, b) => a - b,
    );
    const roster = await this.rosterTeamIdsInOrder(group);
    const teamRepo = this.matchesRepo.manager.getRepository(Team);

    const rounds: ZoneRoundViewDto[] = [];
    for (const roundNumber of roundNums) {
      const inRound = meta
        .filter((x) => x.round === roundNumber)
        .sort((a, b) => a.matchOrder - b.matchOrder)
        .map((x) => x.view);
      const played = new Set<string>();
      for (const m of inRound) {
        played.add(m.teamAId);
        played.add(m.teamBId);
      }
      const idle = roster.filter((id) => !played.has(id));
      let bye: { teamId: string; teamName: string } | null = null;
      if (idle.length === 1) {
        const t = await teamRepo.findOneBy({ id: idle[0] });
        if (t) {
          bye = { teamId: t.id, teamName: t.name };
        }
      }
      rounds.push({ roundNumber, matches: inRound, bye });
    }

    return { rounds };
  }

  private async rosterTeamIdsInOrder(
    group: BracketGroupCode,
  ): Promise<string[]> {
    const rows = await this.bracketTeamsRepo.find({
      where: { groupCode: group },
      relations: ['team'],
      order: { slotIndex: 'ASC' },
    });
    return rows
      .filter((r) => r.team?.id)
      .map((r) => r.team!.id);
  }

  /**
   * Builds a full round-robin from roster slot order (each team plays every
   * other team once: 5 teams ⇒ 5 rounds + byes; 6 teams ⇒ 5 rounds, no bye).
   */
  async generateRoundRobinFromRoster(
    group: BracketGroupCode,
  ): Promise<ZoneMatchesGroupDto> {
    const roster = await this.rosterTeamIdsInOrder(group);
    if (roster.length < 2) {
      throw new BadRequestException(
        `Group ${group} needs at least 2 teams to generate a schedule`,
      );
    }
    const plan = buildZoneRoundRobin(roster);
    await this.persistPlan(group, plan);
    return this.listZoneMatchesForGroup(group);
  }

  async clearZoneMatches(group: BracketGroupCode): Promise<ZoneMatchesGroupDto> {
    const prefix = this.zoneCodePrefix(group);
    await this.matchesRepo
      .createQueryBuilder()
      .delete()
      .where('code LIKE :p', { p: `${prefix}%` })
      .execute();
    return this.listZoneMatchesForGroup(group);
  }

  /** Replace the full zone schedule (same shape as round-robin generator). */
  async replaceScheduleManual(
    group: BracketGroupCode,
    dto: SetZoneScheduleDto,
  ): Promise<ZoneMatchesGroupDto> {
    const roster = await this.rosterTeamIdsInOrder(group);
    const rosterSet = new Set(roster);
    if (roster.length < 2) {
      throw new BadRequestException(
        `Group ${group} needs at least 2 teams for a schedule`,
      );
    }
    const incoming = [...dto.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    const isOdd = roster.length % 2 === 1;

    for (const step of incoming) {
      const inRound = new Set<string>();
      for (const p of step.pairings) {
        if (!rosterSet.has(p.teamAId) || !rosterSet.has(p.teamBId)) {
          throw new BadRequestException(
            `Round ${step.roundNumber}: teams must belong to group ${group}`,
          );
        }
        if (p.teamAId === p.teamBId) {
          throw new BadRequestException(
            `Round ${step.roundNumber}: a team cannot face itself`,
          );
        }
        for (const id of [p.teamAId, p.teamBId]) {
          if (inRound.has(id)) {
            throw new BadRequestException(
              `Round ${step.roundNumber}: team appears more than once`,
            );
          }
          inRound.add(id);
        }
      }

      if (isOdd) {
        const bye = step.byeTeamId;
        if (!bye || !rosterSet.has(bye)) {
          throw new BadRequestException(
            `Round ${step.roundNumber}: odd roster requires a valid byeTeamId`,
          );
        }
        if (inRound.has(bye)) {
          throw new BadRequestException(
            `Round ${step.roundNumber}: bye team is already playing`,
          );
        }
        inRound.add(bye);
      } else if (step.byeTeamId != null && step.byeTeamId !== '') {
        throw new BadRequestException(
          `Round ${step.roundNumber}: even roster must not set byeTeamId`,
        );
      }

      if (inRound.size !== roster.length) {
        throw new BadRequestException(
          `Round ${step.roundNumber}: every team must play or take the bye exactly once`,
        );
      }
    }

    const plan: ZoneRoundPlan[] = incoming.map((s) => ({
      roundNumber: s.roundNumber,
      pairings: s.pairings.map((p) => ({
        teamAId: p.teamAId,
        teamBId: p.teamBId,
      })),
      byeTeamId: s.byeTeamId ?? null,
    }));

    await this.persistPlan(group, plan);
    return this.listZoneMatchesForGroup(group);
  }

  private async persistPlan(
    group: BracketGroupCode,
    plan: readonly ZoneRoundPlan[],
  ): Promise<void> {
    const teamRepo = this.matchesRepo.manager.getRepository(Team);
    const roster = new Set(await this.rosterTeamIdsInOrder(group));
    for (const step of plan) {
      for (const p of step.pairings) {
        if (!roster.has(p.teamAId) || !roster.has(p.teamBId)) {
          throw new BadRequestException(
            `Schedule references a team not in group ${group}`,
          );
        }
      }
      if (step.byeTeamId != null && !roster.has(step.byeTeamId)) {
        throw new BadRequestException(
          `Schedule bye references a team not in group ${group}`,
        );
      }
    }

    await this.matchesRepo.manager.transaction(async (em) => {
      const matchRepo = em.getRepository(Match);
      const prefix = this.zoneCodePrefix(group);
      await matchRepo
        .createQueryBuilder()
        .delete()
        .where('code LIKE :p', { p: `${prefix}%` })
        .execute();

      for (const step of plan) {
        let mIdx = 0;
        for (const p of step.pairings) {
          mIdx += 1;
          const teamA = await teamRepo.findOneByOrFail({ id: p.teamAId });
          const teamB = await teamRepo.findOneByOrFail({ id: p.teamBId });
          await matchRepo.save(
            matchRepo.create({
              code: this.matchCode(group, step.roundNumber, mIdx),
              status: MatchStatus.SCHEDULED,
              teamA,
              teamB,
              startAt: new Date(),
              endAt: null,
              scoreA: null,
              scoreB: null,
              mapName: null,
              vetoBans: null,
              vetoPicks: null,
            }),
          );
        }
      }
    });
  }
}
