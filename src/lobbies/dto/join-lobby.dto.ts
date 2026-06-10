import { IsIn, IsOptional } from 'class-validator';

import type { PlayingTeam } from '../lobby.types';

/** `POST /lobbies/:id/join?team=A|B` — empty team means backend auto-assigns. */
export class JoinLobbyQueryDto {
  @IsOptional()
  @IsIn(['A', 'B'])
  team?: PlayingTeam;
}
