import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

import type { LobbyMode, LobbyRegion } from '../lobby.types';
import { LOBBY_REGIONS } from '../lobby.types';
import { LobbyFeaturesDto } from './lobby-features.dto';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Body of `POST /lobbies`. `mode` is restricted to BO3/BO5 — tournament is
 * handled by a separate inquiry endpoint.
 */
export class CreateLobbyDto {
  @IsIn(['BO3', 'BO5'])
  mode!: LobbyMode;

  @IsString()
  @Transform(({ value }): string =>
    typeof value === 'string'
      ? value.replace(CONTROL_CHARS, '').trim()
      : (value as string),
  )
  @Length(3, 64)
  name!: string;

  @IsIn(LOBBY_REGIONS as readonly string[])
  region!: LobbyRegion;

  @IsOptional()
  @IsString()
  @Transform(({ value }): string | undefined => {
    if (typeof value !== 'string') {
      return value as string | undefined;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  @Matches(/^[\x20-\x7e]{0,32}$/, {
    message: 'serverPassword must be 0..32 ASCII-printable characters',
  })
  serverPassword?: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => LobbyFeaturesDto)
  features!: LobbyFeaturesDto;
}
