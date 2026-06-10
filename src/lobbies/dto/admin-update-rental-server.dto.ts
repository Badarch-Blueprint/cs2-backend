import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type { RentalServerStatus } from '../lobby.types';

/**
 * Admin body for `PATCH /admin/rental-servers/:id`. When `status = 'READY'`,
 * the lobby transitions to LIVE and `connectString` is computed from
 * `host`/`port`/`password`.
 */
export class AdminUpdateRentalServerDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  gotvPort?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @IsOptional()
  @IsIn(['PROVISIONING', 'READY', 'ACTIVE', 'EXPIRED', 'FAILED', 'RELEASED'])
  status?: RentalServerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
