import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { Cs2OrchestratorBridgeService } from '../dashboard/cs2-orchestrator-bridge.service';
import { MatchVetoBroadcastService } from '../dashboard/match-veto-broadcast.service';
import { PromoteRoundToVetoPhaseDto } from './dto/promote-round-to-veto-phase.dto';

export type AdminMatchListRowDto = {
  id: string;
  code: string | null;
  status: string;
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string;
  teamBName: string;
  startAt: string;
  endAt: string | null;
  scoreA: number | null;
  scoreB: number | null;
};

export type AdminMatchesListResponseDto = {
  matches: AdminMatchListRowDto[];
};

export type AdminRoundPromoteResponseDto = {
  updatedCount: number;
};

export type AdminMatchActionResponseDto = {
  ok: true;
};

@Injectable()
export class AdminMatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    private readonly cs2Orchestrator: Cs2OrchestratorBridgeService,
    private readonly vetoBroadcast: MatchVetoBroadcastService,
  ) {}

  async listAll(): Promise<AdminMatchesListResponseDto> {
    const rows = await this.matchesRepo.find({
      relations: { teamA: true, teamB: true },
      order: { startAt: 'DESC' },
    });

    const matches: AdminMatchListRowDto[] = rows.map((m) => ({
      id: m.id,
      code: m.code,
      status: m.status,
      teamAId: m.teamA?.id ?? null,
      teamBId: m.teamB?.id ?? null,
      teamAName: m.teamA?.name ?? '—',
      teamBName: m.teamB?.name ?? '—',
      startAt: m.startAt.toISOString(),
      endAt: m.endAt ? m.endAt.toISOString() : null,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
    }));

    return { matches };
  }

  async promoteRoundScheduledToVetoPhase(
    dto: PromoteRoundToVetoPhaseDto,
  ): Promise<AdminRoundPromoteResponseDto> {
    const zones = [...new Set(dto.zones.map((z) => z.trim().toUpperCase()))];
    const round = dto.round;
    if (zones.length === 0) {
      return { updatedCount: 0 };
    }

    const qb = this.matchesRepo
      .createQueryBuilder()
      .update(Match)
      .set({ status: MatchStatus.VETO_PHASE })
      .where('status = :scheduled', { scheduled: MatchStatus.SCHEDULED })
      .andWhere(
        new Brackets((expr) => {
          for (const [idx, zone] of zones.entries()) {
            expr.orWhere(`code ILIKE :zoneRound${idx}`, {
              [`zoneRound${idx}`]: `Zone-${zone}-R${round}%`,
            });
          }
        }),
      );

    const result = await qb.execute();
    return { updatedCount: result.affected ?? 0 };
  }

  async takeTechPause(matchId: string): Promise<AdminMatchActionResponseDto> {
    const match = await this.loadMatchOrThrow(matchId);
    const status = this.statusUpper(match);
    if (
      status !== MatchStatus.LIVE &&
      status !== MatchStatus.CONFIGURING_SERVER &&
      status !== MatchStatus.VETO_PHASE &&
      status !== MatchStatus.WAITING_FOR_PLAYERS
    ) {
      throw new BadRequestException(
        `Tech pause is not available while match is ${match.status}`,
      );
    }
    const note = `[ADMIN_ACTION] TECH_PAUSE requested ${new Date().toISOString()}`;
    match.cs2StartLog = match.cs2StartLog
      ? `${match.cs2StartLog}\n${note}`
      : note;
    await this.matchesRepo.save(match);
    this.vetoBroadcast.emitMatchUpdated(match.id);
    this.vetoBroadcast.emitVetoUpdated(match.id);
    return { ok: true };
  }

  async forceStart(matchId: string): Promise<AdminMatchActionResponseDto> {
    const match = await this.loadMatchOrThrow(matchId);
    await this.requestServerStart(match, 'FORCE_START');
    return { ok: true };
  }

  async bootFromBackup(matchId: string): Promise<AdminMatchActionResponseDto> {
    const match = await this.loadMatchOrThrow(matchId);
    await this.requestServerStart(match, 'BOOT_FROM_BACKUP');
    return { ok: true };
  }

  async manualStart(matchId: string): Promise<AdminMatchActionResponseDto> {
    const match = await this.loadMatchOrThrow(matchId);
    await this.requestServerStart(match, 'MANUAL_START');
    return { ok: true };
  }

  private async requestServerStart(
    match: Match,
    action: 'FORCE_START' | 'BOOT_FROM_BACKUP' | 'MANUAL_START',
  ): Promise<void> {
    const mapName = match.mapName?.trim();
    if (!mapName) {
      throw new BadRequestException(
        'Cannot start server because this match does not have a selected map yet',
      );
    }
    match.status = MatchStatus.CONFIGURING_SERVER;
    const note = `[ADMIN_ACTION] ${action} requested ${new Date().toISOString()}`;
    match.cs2StartLog = match.cs2StartLog
      ? `${match.cs2StartLog}\n${note}`
      : note;
    await this.matchesRepo.save(match);
    this.vetoBroadcast.emitMatchUpdated(match.id);
    this.vetoBroadcast.emitVetoUpdated(match.id);
    this.cs2Orchestrator.requestDedicatedServerAfterVeto(match.id, mapName);
  }

  private async loadMatchOrThrow(matchId: string): Promise<Match> {
    const match = await this.matchesRepo.findOne({ where: { id: matchId } });
    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }
    return match;
  }

  private statusUpper(match: Match): string {
    return String(match.status).trim().toUpperCase();
  }
}
