import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

/**
 * Payload from the CS2 game-server integration when a Swiss zone map is finished.
 */
export class RecordMatchResultDto {
  @IsUUID('4')
  matchId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(32)
  scoreA!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(32)
  scoreB!: number;
}
