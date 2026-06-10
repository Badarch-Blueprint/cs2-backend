import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';
import type { SqlJsStatic } from 'sql.js';
import { BracketTeam } from '../brackets/bracket-team.entity';
import { PlayoffBracket } from '../brackets/playoff-bracket.entity';
import { Lobby } from '../lobbies/entities/lobby.entity';
import { LobbyMember } from '../lobbies/entities/lobby-member.entity';
import { RentalServer } from '../lobbies/entities/rental-server.entity';
import { TournamentInquiry } from '../lobbies/entities/tournament-inquiry.entity';
import { Match } from '../matches/match.entity';
import { Team } from '../teams/team.entity';
import { TeamMember } from '../teams/team-member.entity';
import { User } from '../users/user.entity';

import { CatalogSkin } from '../weaponpaints/entities/catalog/catalog-skin.entity';
import { CatalogAgent } from '../weaponpaints/entities/catalog/catalog-agent.entity';
import { CatalogCollectible } from '../weaponpaints/entities/catalog/catalog-collectible.entity';
import { CatalogGlove } from '../weaponpaints/entities/catalog/catalog-glove.entity';
import { CatalogKeychain } from '../weaponpaints/entities/catalog/catalog-keychain.entity';
import { CatalogKnife } from '../weaponpaints/entities/catalog/catalog-knife.entity';
import { CatalogMusic } from '../weaponpaints/entities/catalog/catalog-music.entity';
import { CatalogSticker } from '../weaponpaints/entities/catalog/catalog-sticker.entity';
import { CatalogVersion } from '../weaponpaints/entities/catalog/catalog-version.entity';

import { PlayerSkin } from '../weaponpaints/entities/player/player-skin.entity';
import { PlayerAgent } from '../weaponpaints/entities/player/player-agent.entity';
import { PlayerGlove } from '../weaponpaints/entities/player/player-glove.entity';
import { PlayerKnife } from '../weaponpaints/entities/player/player-knife.entity';
import { PlayerMusic } from '../weaponpaints/entities/player/player-music.entity';
import { PlayerPin } from '../weaponpaints/entities/player/player-pin.entity';

type InitSqlJs = (config?: {
  locateFile?: (file: string) => string;
}) => Promise<SqlJsStatic>;

export async function buildTypeOrmOptions(
  configService: ConfigService,
): Promise<TypeOrmModuleOptions> {
  if (process.env.NODE_ENV === 'test') {
    // require avoids Jest dynamic-import limitations in default VM mode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqlJsExport = require('sql.js') as InitSqlJs | { default: InitSqlJs };
    const initSqlJs: InitSqlJs =
      typeof sqlJsExport === 'function' ? sqlJsExport : sqlJsExport.default;
    const SQL: SqlJsStatic = await initSqlJs({
      locateFile: (file: string) =>
        join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
    });
    return {
      type: 'sqljs',
      driver: SQL,
      entities: [
        User,
        BracketTeam,
        PlayoffBracket,
        Team,
        TeamMember,
        Match,
        Lobby,
        LobbyMember,
        RentalServer,
        TournamentInquiry,
        CatalogSkin,
        CatalogAgent,
        CatalogCollectible,
        CatalogGlove,
        CatalogKeychain,
        CatalogKnife,
        CatalogMusic,
        CatalogSticker,
        CatalogVersion,
      ],
      synchronize: true,
      autoSave: false,
    };
  }

  return {
    type: 'postgres',
    host: configService.getOrThrow<string>('DATABASE_HOST'),
    port: Number(configService.get<string>('DATABASE_PORT') ?? '5432'),
    username: configService.getOrThrow<string>('DATABASE_USER'),
    password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
    database: configService.getOrThrow<string>('DATABASE_NAME'),
    entities: [
      User,
      BracketTeam,
      PlayoffBracket,
      Team,
      TeamMember,
      Match,
      Lobby,
      LobbyMember,
      RentalServer,
      TournamentInquiry,
      CatalogSkin,
      CatalogAgent,
      CatalogCollectible,
      CatalogGlove,
      CatalogKeychain,
      CatalogKnife,
      CatalogMusic,
      CatalogSticker,
      CatalogVersion,
    ],
    synchronize: process.env.NODE_ENV !== 'production',
    extra: {
      // Roles with an empty search_path hit "no schema has been selected to create in"
      options: '-c search_path=public',
    },
  };
}

export async function buildWeaponPaintsTypeOrmOptions(
  configService: ConfigService,
): Promise<TypeOrmModuleOptions> {
  if (process.env.NODE_ENV === 'test') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqlJsExport = require('sql.js') as InitSqlJs | { default: InitSqlJs };
    const initSqlJs: InitSqlJs =
      typeof sqlJsExport === 'function' ? sqlJsExport : sqlJsExport.default;
    const SQL: SqlJsStatic = await initSqlJs({
      locateFile: (file: string) =>
        join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
    });
    return {
      type: 'sqljs',
      driver: SQL,
      entities: [
        PlayerSkin,
        PlayerAgent,
        PlayerGlove,
        PlayerKnife,
        PlayerMusic,
        PlayerPin,
      ],
      synchronize: true,
      autoSave: false,
    };
  }

  return {
    type: 'mysql',
    host: configService.get<string>('WP_DB_HOST', 'localhost'),
    port: Number(configService.get<string>('WP_DB_PORT') ?? '3306'),
    username: configService.get<string>('WP_DB_USER', 'root'),
    password: configService.get<string>('WP_DB_PASSWORD', ''),
    database: configService.get<string>('WP_DB_NAME', 'weaponpaints'),
    entities: [
      PlayerSkin,
      PlayerAgent,
      PlayerGlove,
      PlayerKnife,
      PlayerMusic,
      PlayerPin,
    ],
    synchronize: false,
  };
}
