import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { LOBBY_STATUSES, type LobbyStatus } from '../lobby.types';

/** Admin override body for `PATCH /admin/lobbies/:id`. */
export class AdminUpdateLobbyDto {
  @IsOptional()
  @IsIn(LOBBY_STATUSES as readonly string[])
  status?: LobbyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
