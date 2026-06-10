import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { ZonePlayoffSeederService } from '../brackets/zone-playoff-seeder.service';
import type { RecordMatchResultDto } from './dto/record-match-result.dto';

export type RecordZoneMatchResultResponseDto = {
  readonly matchId: string;
  readonly code: string | null;
  readonly status: MatchStatus;
  readonly scoreA: number | null;
  readonly scoreB: number | null;
  readonly playoffsSeeded: boolean;
  readonly playoffSeedReason?: string;
};

@Injectable()
export class GameServerMatchResultsService {
  private readonly logger = new Logger(GameServerMatchResultsService.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    private readonly zonePlayoffSeeder: ZonePlayoffSeederService,
  ) {}

  /**
   * Persists final scores for a Swiss zone match (`Zone-*` code), then — when
   * every zone map in the tournament is settled — fills playoff QF slots from
   * group standings (W + round diff).
   */
  async recordSwissZoneMatchResult(
    dto: RecordMatchResultDto,
  ): Promise<RecordZoneMatchResultResponseDto> {
    if (dto.scoreA === dto.scoreB) {
      throw new BadRequestException('Map scores cannot be tied for a finished result');
    }

    const match = await this.matchesRepo.findOne({
      where: { id: dto.matchId },
      relations: ['teamA', 'teamB'],
    });
    if (!match) {
      throw new NotFoundException(`Match ${dto.matchId} not found`);
    }
    const code = match.code ?? '';
    if (!code.startsWith('Zone-')) {
      throw new BadRequestException(
        'This endpoint only accepts Swiss zone matches (code must start with Zone-)',
      );
    }

    match.scoreA = dto.scoreA;
    match.scoreB = dto.scoreB;
    match.status = MatchStatus.FINISHED;
    match.endAt = new Date();
    await this.matchesRepo.save(match);

    let playoffsSeeded = false;
    let playoffSeedReason: string | undefined;
    try {
      const seed = await this.zonePlayoffSeeder.tryAutoSeedPlayoffsFromSwissZoneCompletion();
      playoffsSeeded = seed.seeded;
      playoffSeedReason = seed.reason;
    } catch (err) {
      this.logger.error(
        `Playoff auto-seed failed after zone match ${match.id}: ${String(err)}`,
      );
      playoffSeedReason = 'playoff_seed_failed';
    }

    return {
      matchId: match.id,
      code: match.code,
      status: match.status,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      playoffsSeeded,
      playoffSeedReason,
    };
  }
}
