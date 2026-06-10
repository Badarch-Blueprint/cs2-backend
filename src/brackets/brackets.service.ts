import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BRACKET_GROUP_CODES,
  type BracketGroupCode,
  bracketSlotCount,
} from './bracket.constants';
import { BracketTeam } from './bracket-team.entity';
import type { CreateBracketTeamDto } from './dto/create-bracket-team.dto';
import { PlayoffBracket } from './playoff-bracket.entity';
import {
  PLAYOFF_MATCH_COUNT,
  PLAYOFF_SLOTS_PER_MATCH,
} from './playoff.constants';
import { Team } from '../teams/team.entity';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BracketSlotDto = {
  slotIndex: number;
  teamId: string | null;
  teamName: string | null;
  id: string | null;
};

export type BracketGroupViewDto = {
  code: BracketGroupCode;
  slotCount: number;
  slots: BracketSlotDto[];
};

export type PlayoffSlotDto = {
  slotIndex: number;
  teamName: string | null;
  id: string | null;
};

export type PlayoffMatchDto = {
  matchNumber: number;
  slots: PlayoffSlotDto[];
};

export type PlayoffBracketViewDto = {
  matches: PlayoffMatchDto[];
};

@Injectable()
export class BracketsService {
  constructor(
    @InjectRepository(BracketTeam)
    private readonly teamsRepo: Repository<BracketTeam>,
    @InjectRepository(PlayoffBracket)
    private readonly playoffRepo: Repository<PlayoffBracket>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
  ) {}

  assertGroup(code: string): BracketGroupCode {
    const u = code.trim().toUpperCase();
    if (!(BRACKET_GROUP_CODES as readonly string[]).includes(u)) {
      throw new BadRequestException(
        `Invalid group "${code}". Use one of: ${BRACKET_GROUP_CODES.join(', ')}`,
      );
    }
    return u as BracketGroupCode;
  }

  async getFullBracket(): Promise<{
    groups: BracketGroupViewDto[];
    playoffs: PlayoffBracketViewDto;
  }> {
    const rows = await this.teamsRepo.find({
      relations: ['team'],
      order: { groupCode: 'ASC', slotIndex: 'ASC' },
    });
    const byGroup = new Map<BracketGroupCode, BracketTeam[]>();
    for (const g of BRACKET_GROUP_CODES) {
      byGroup.set(
        g,
        rows.filter((r) => r.groupCode === g),
      );
    }
    const playoffs = await this.getPlayoffsView();
    return {
      groups: BRACKET_GROUP_CODES.map((code) =>
        this.buildGroupView(code, byGroup.get(code) ?? []),
      ),
      playoffs,
    };
  }

  async getPlayoffsView(): Promise<PlayoffBracketViewDto> {
    const rows = await this.playoffRepo.find({
      order: { matchNumber: 'ASC', slotIndex: 'ASC' },
    });
    const byKey = new Map<string, PlayoffBracket>();
    for (const r of rows) {
      byKey.set(`${r.matchNumber}-${r.slotIndex}`, r);
    }
    const matches: PlayoffMatchDto[] = [];
    for (let m = 1; m <= PLAYOFF_MATCH_COUNT; m++) {
      const slots: PlayoffSlotDto[] = [];
      for (let s = 0; s < PLAYOFF_SLOTS_PER_MATCH; s++) {
        const row = byKey.get(`${m}-${s}`);
        slots.push({
          slotIndex: s,
          teamName: row?.teamName ?? null,
          id: row?.id ?? null,
        });
      }
      matches.push({ matchNumber: m, slots });
    }
    return { matches };
  }

  /** Replaces all playoff slots from a length-14 roster (row-major). Empty strings clear a slot. */
  async replacePlayoffs(roster: string[]): Promise<PlayoffBracketViewDto> {
    await this.playoffRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(PlayoffBracket);
      await repo.clear();
      for (let i = 0; i < roster.length; i++) {
        const trimmed = roster[i]?.trim() ?? '';
        if (trimmed === '') {
          continue;
        }
        const matchNumber = Math.floor(i / PLAYOFF_SLOTS_PER_MATCH) + 1;
        const slotIndex = i % PLAYOFF_SLOTS_PER_MATCH;
        await repo.save(
          repo.create({
            matchNumber,
            slotIndex,
            teamName: trimmed,
          }),
        );
      }
    });
    return this.getPlayoffsView();
  }

  async getGroup(code: BracketGroupCode): Promise<BracketGroupViewDto> {
    const rows = await this.teamsRepo.find({
      where: { groupCode: code },
      relations: ['team'],
      order: { slotIndex: 'ASC' },
    });
    return this.buildGroupView(code, rows);
  }

  private buildGroupView(
    code: BracketGroupCode,
    rows: BracketTeam[],
  ): BracketGroupViewDto {
    const cap = bracketSlotCount(code);
    const slots: BracketSlotDto[] = [];
    for (let i = 0; i < cap; i++) {
      const row = rows.find((r) => r.slotIndex === i);
      slots.push({
        slotIndex: i,
        teamId: row?.team?.id ?? null,
        teamName: row?.team?.name ?? null,
        id: row?.id ?? null,
      });
    }
    return { code, slotCount: cap, slots };
  }

  private async resolveTeam(teamId: string): Promise<Team> {
    const trimmed = teamId.trim();
    if (!UUID_V4.test(trimmed)) {
      throw new BadRequestException(`Invalid team id "${teamId}"`);
    }
    const team = await this.teamRepo.findOneBy({ id: trimmed });
    if (!team) {
      throw new BadRequestException(`Unknown team id "${trimmed}"`);
    }
    return team;
  }

  async addTeam(
    group: BracketGroupCode,
    dto: CreateBracketTeamDto,
  ): Promise<BracketTeam> {
    const team = await this.resolveTeam(dto.teamId);
    const cap = bracketSlotCount(group);
    let slot = dto.slotIndex;
    if (slot !== undefined) {
      if (slot < 0 || slot >= cap) {
        throw new BadRequestException(
          `slotIndex must be between 0 and ${cap - 1} for group ${group}`,
        );
      }
      const taken = await this.teamsRepo.findOne({
        where: { groupCode: group, slotIndex: slot },
      });
      if (taken) {
        throw new ConflictException(
          `Slot ${slot} in group ${group} is already filled`,
        );
      }
    } else {
      const used = await this.teamsRepo.find({
        where: { groupCode: group },
        select: ['slotIndex'],
      });
      const usedSet = new Set(used.map((r) => r.slotIndex));
      slot = undefined;
      for (let i = 0; i < cap; i++) {
        if (!usedSet.has(i)) {
          slot = i;
          break;
        }
      }
      if (slot === undefined) {
        throw new BadRequestException(`Group ${group} is full (${cap} teams)`);
      }
    }

    const entity = this.teamsRepo.create({
      groupCode: group,
      slotIndex: slot,
      team,
    });
    return this.teamsRepo.save(entity);
  }

  async updateTeam(
    group: BracketGroupCode,
    slotIndex: number,
    teamId: string,
  ): Promise<BracketTeam> {
    const team = await this.resolveTeam(teamId);
    const cap = bracketSlotCount(group);
    if (slotIndex < 0 || slotIndex >= cap) {
      throw new BadRequestException(
        `slotIndex must be between 0 and ${cap - 1} for group ${group}`,
      );
    }
    const row = await this.teamsRepo.findOne({
      where: { groupCode: group, slotIndex },
      relations: ['team'],
    });
    if (!row) {
      throw new NotFoundException(
        `No team in group ${group} at slot ${slotIndex}`,
      );
    }
    row.team = team;
    return this.teamsRepo.save(row);
  }

  /** Idempotent: clearing an empty slot is a no-op. */
  async removeTeam(group: BracketGroupCode, slotIndex: number): Promise<void> {
    const cap = bracketSlotCount(group);
    if (slotIndex < 0 || slotIndex >= cap) {
      throw new BadRequestException(
        `slotIndex must be between 0 and ${cap - 1} for group ${group}`,
      );
    }
    await this.teamsRepo.delete({ groupCode: group, slotIndex });
  }

  async replaceGroupRoster(
    group: BracketGroupCode,
    teamIds: string[],
  ): Promise<BracketGroupViewDto> {
    const cap = bracketSlotCount(group);
    if (teamIds.length !== cap) {
      throw new BadRequestException(
        `Group ${group} requires exactly ${cap} team id slots (got ${teamIds.length})`,
      );
    }
    await this.teamsRepo.manager.transaction(async (em) => {
      const bracketRepo = em.getRepository(BracketTeam);
      const teamRepoTx = em.getRepository(Team);
      await bracketRepo.delete({ groupCode: group });
      for (let i = 0; i < cap; i++) {
        const raw = teamIds[i];
        if (raw === undefined) {
          throw new BadRequestException(`Missing team id at slot ${i}`);
        }
        const trimmed = raw.trim();
        if (trimmed === '') {
          continue;
        }
        if (!UUID_V4.test(trimmed)) {
          throw new BadRequestException(`Invalid team id at slot ${i}`);
        }
        const team = await teamRepoTx.findOneBy({ id: trimmed });
        if (!team) {
          throw new BadRequestException(`Unknown team id at slot ${i}`);
        }
        await bracketRepo.save(
          bracketRepo.create({
            groupCode: group,
            slotIndex: i,
            team,
          }),
        );
      }
    });
    return this.getGroup(group);
  }
}
