import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateBracketTeamDto {
  @IsUUID('4')
  teamId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  /** Largest slot index is 5 (group A); service still validates per-group caps. */
  @Max(5)
  slotIndex?: number;
}
