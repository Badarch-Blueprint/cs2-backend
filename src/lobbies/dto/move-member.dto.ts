import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

import type { LobbyTeam } from '../lobby.types';

/**
 * Body of `POST /lobbies/:id/move`. `promoteCaptain` demotes any current
 * captain on the target team and marks the moved member as CAPTAIN.
 */
export class MoveMemberDto {
  @IsUUID()
  userId!: string;

  @IsIn(['A', 'B', 'SPECTATOR'])
  team!: LobbyTeam;

  @IsOptional()
  @IsBoolean()
  promoteCaptain?: boolean;
}
