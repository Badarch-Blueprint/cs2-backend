import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { BracketTeam } from './bracket-team.entity';
import {
  BRACKET_GROUP_CODES,
  type BracketGroupCode,
} from './bracket.constants';
import { BracketsService } from './brackets.service';
import { PLAYOFF_TOTAL_SLOTS } from './playoff.constants';

const ZONE_CODE_RE = /^Zone-([ABCD])-R(\d+)-M(\d+)$/i;

export type AutoSeedPlayoffsResult = {
  readonly seeded: boolean;
  readonly reason?: string;
};

type TeamStanding = {
  readonly teamId: string;
  readonly name: string;
  wins: number;
  losses: number;
  roundDiff: number;
};

function parseZoneGroup(code: string | null): BracketGroupCode | null {
  if (!code) {
    return null;
  }
  const m = ZONE_CODE_RE.exec(code);
  const g = m?.[1]?.toUpperCase();
  if (g && (BRACKET_GROUP_CODES as readonly string[]).includes(g)) {
    return g as BracketGroupCode;
  }
  return null;
}

function isZoneMapSettledForGate(m: Match): boolean {
  if (!m.code?.startsWith('Zone-')) {
    return false;
  }
  if (m.status === MatchStatus.CANCELLED) {
    return true;
  }
  return (
    m.status === MatchStatus.FINISHED &&
    m.scoreA != null &&
    m.scoreB != null
  );
}

function isZoneMapForStandings(m: Match): boolean {
  return (
    m.status === MatchStatus.FINISHED &&
    m.scoreA != null &&
    m.scoreB != null &&
    !!m.code?.startsWith('Zone-')
  );
}

@Injectable()
export class ZonePlayoffSeederService {
  private readonly logger = new Logger(ZonePlayoffSeederService.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    @InjectRepository(BracketTeam)
    private readonly bracketTeamsRepo: Repository<BracketTeam>,
    private readonly brackets: BracketsService,
  ) {}

  /**
   * When every Swiss zone row is settled and all four groups A–D appear in the
   * schedule, compute group standings (W + round diff tiebreak), take top two
   * per group, and replace `playoff_brackets` QF slots (matches 1–4). SF/Final
   * cells stay empty until those matches are played or set manually.
   */
  async tryAutoSeedPlayoffsFromSwissZoneCompletion(): Promise<AutoSeedPlayoffsResult> {
    const zoneRows = await this.matchesRepo.find({
      where: { code: Like('Zone-%') },
      relations: ['teamA', 'teamB'],
      order: { code: 'ASC' },
    });

    if (zoneRows.length === 0) {
      return { seeded: false, reason: 'no_zone_matches' };
    }

    const unsettled = zoneRows.filter((m) => !isZoneMapSettledForGate(m));
    if (unsettled.length > 0) {
      return { seeded: false, reason: 'zone_maps_still_in_progress' };
    }

    const groupsPresent = new Set<BracketGroupCode>();
    for (const m of zoneRows) {
      const g = parseZoneGroup(m.code);
      if (g) {
        groupsPresent.add(g);
      }
    }
    for (const need of BRACKET_GROUP_CODES) {
      if (!groupsPresent.has(need)) {
        return {
          seeded: false,
          reason: `missing_zone_schedule_for_group_${need}`,
        };
      }
    }

    for (const g of BRACKET_GROUP_CODES) {
      const rosterCount = await this.bracketTeamsRepo.count({
        where: { groupCode: g },
      });
      if (rosterCount < 2) {
        return {
          seeded: false,
          reason: `group_${g}_needs_at_least_two_bracket_teams`,
        };
      }
    }

    const standingsByGroup = await this.computeStandingsByGroup(zoneRows);
    const ranked = new Map<BracketGroupCode, TeamStanding[]>();
    for (const g of BRACKET_GROUP_CODES) {
      const list = standingsByGroup.get(g) ?? [];
      if (list.length < 2) {
        return {
          seeded: false,
          reason: `group_${g}_insufficient_standings_data`,
        };
      }
      ranked.set(
        g,
        [...list].sort((a, b) => {
          if (b.wins !== a.wins) {
            return b.wins - a.wins;
          }
          if (b.roundDiff !== a.roundDiff) {
            return b.roundDiff - a.roundDiff;
          }
          return a.name.localeCompare(b.name);
        }),
      );
    }

    const roster = this.buildQuarterFinalRoster14(ranked);
    await this.brackets.replacePlayoffs(roster);
    this.logger.log(
      'Playoff bracket QF slots auto-filled from Swiss zone standings.',
    );
    return { seeded: true, reason: 'seeded_quarterfinals_from_swiss' };
  }

  private async computeStandingsByGroup(
    zoneRows: readonly Match[],
  ): Promise<Map<BracketGroupCode, TeamStanding[]>> {
    const roster = await this.bracketTeamsRepo.find({
      where: { groupCode: In([...BRACKET_GROUP_CODES]) },
      relations: ['team'],
      order: { groupCode: 'ASC', slotIndex: 'ASC' },
    });

    const byGroup = new Map<BracketGroupCode, Map<string, TeamStanding>>();
    for (const g of BRACKET_GROUP_CODES) {
      byGroup.set(g, new Map());
    }
    for (const row of roster) {
      const g = row.groupCode;
      const id = row.team?.id;
      const name = row.team?.name?.trim();
      if (!id || !name) {
        continue;
      }
      const m = byGroup.get(g)!;
      m.set(id, { teamId: id, name, wins: 0, losses: 0, roundDiff: 0 });
    }

    for (const m of zoneRows) {
      if (!isZoneMapForStandings(m)) {
        continue;
      }
      const g = parseZoneGroup(m.code);
      if (!g) {
        continue;
      }
      const aId = m.teamA?.id;
      const bId = m.teamB?.id;
      if (!aId || !bId) {
        continue;
      }
      const map = byGroup.get(g);
      if (!map) {
        continue;
      }
      const ta = map.get(aId);
      const tb = map.get(bId);
      if (!ta || !tb) {
        continue;
      }
      const sa = m.scoreA!;
      const sb = m.scoreB!;
      ta.roundDiff += sa - sb;
      tb.roundDiff += sb - sa;
      if (sa > sb) {
        ta.wins += 1;
        tb.losses += 1;
      } else if (sb > sa) {
        tb.wins += 1;
        ta.losses += 1;
      }
    }

    const out = new Map<BracketGroupCode, TeamStanding[]>();
    for (const g of BRACKET_GROUP_CODES) {
      out.set(g, [...(byGroup.get(g)?.values() ?? [])]);
    }
    return out;
  }

  /**
   * Quarterfinal pairings (match order 1–4): (C2 vs B1), (C1 vs B2), (A1 vs D2), (A2 vs D1).
   * A1 = group A #1 seed by W/RD, etc.
   */
  private buildQuarterFinalRoster14(
    ranked: ReadonlyMap<BracketGroupCode, TeamStanding[]>,
  ): string[] {
    const roster = Array.from({ length: PLAYOFF_TOTAL_SLOTS }, () => '');
    const pick = (g: BracketGroupCode, rank: 0 | 1) => {
      const row = ranked.get(g)?.[rank];
      return row?.name?.trim() ?? '';
    };
    const A1 = pick('A', 0);
    const A2 = pick('A', 1);
    const B1 = pick('B', 0);
    const B2 = pick('B', 1);
    const C1 = pick('C', 0);
    const C2 = pick('C', 1);
    const D1 = pick('D', 0);
    const D2 = pick('D', 1);
    const qf: readonly [string, string][] = [
      [C2, B1],
      [C1, B2],
      [A1, D2],
      [A2, D1],
    ];
    if (qf.some(([x, y]) => !x || !y)) {
      throw new Error('Cannot build playoff roster: missing a top-two team name');
    }
    for (let i = 0; i < 4; i++) {
      roster[i * 2] = qf[i]![0]!;
      roster[i * 2 + 1] = qf[i]![1]!;
    }
    return roster;
  }
}
