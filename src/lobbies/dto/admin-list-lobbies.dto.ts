import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { LOBBY_STATUSES, type LobbyStatus } from '../lobby.types';

export class AdminListLobbiesQueryDto {
  @IsOptional()
  @IsIn(LOBBY_STATUSES as readonly string[])
  status?: LobbyStatus;

  @IsOptional()
  @IsUUID()
  hostUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
