import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import type { TournamentInquiryFormat } from '../entities/tournament-inquiry.entity';

const TRIM = ({ value }: { value: unknown }): string | undefined =>
  typeof value === 'string' ? value.trim() : (value as string | undefined);

export class TournamentInquiryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(TRIM)
  organization?: string;

  @IsEmail()
  @MaxLength(160)
  @Transform(TRIM)
  contactEmail!: string;

  @IsString()
  @Length(2, 80)
  @Transform(TRIM)
  contactName!: string;

  @IsInt()
  @IsIn([4, 8, 16, 32])
  bracketSize!: number;

  @IsIn(['single-elim', 'double-elim', 'swiss', 'round-robin', 'other'])
  format!: TournamentInquiryFormat;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
