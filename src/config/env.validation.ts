import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsString()
  PORT?: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  FRONTEND_URL!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  BACKEND_URL!: string;

  @ValidateIf(() => process.env.NODE_ENV !== 'test')
  @IsString()
  DATABASE_HOST!: string;

  @ValidateIf(() => process.env.NODE_ENV !== 'test')
  @IsString()
  DATABASE_NAME!: string;

  @ValidateIf(() => process.env.NODE_ENV !== 'test')
  @IsString()
  DATABASE_USER!: string;

  @ValidateIf(() => process.env.NODE_ENV !== 'test')
  @IsString()
  DATABASE_PASSWORD!: string;

  @ValidateIf(() => process.env.NODE_ENV !== 'test')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DATABASE_PORT?: number;

  @IsOptional()
  @IsString()
  WP_DB_HOST?: string;

  @IsOptional()
  @IsString()
  WP_DB_NAME?: string;

  @IsOptional()
  @IsString()
  WP_DB_USER?: string;

  @IsOptional()
  @IsString()
  WP_DB_PASSWORD?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  WP_DB_PORT?: number;

  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  CS2_HOST_URL?: string;

  /** Hostname/IP shown in `connect` for players (game process may bind the same ports on this host). */
  @IsOptional()
  @IsString()
  CS2_GAME_CONNECT_HOST?: string;

  @IsOptional()
  @IsString()
  STEAM_API_KEY?: string;

  @IsString()
  @MinLength(8, { message: 'JWT_SECRET must be at least 8 characters' })
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  FRONTEND_AUTH_CALLBACK_PATH?: string;

  @IsOptional()
  @IsString()
  BOOTSTRAP_ADMIN_STEAM_IDS?: string;

  /** Shared secret for CS2 servers → `POST /api/integrations/game-server/match-results`. */
  @IsOptional()
  @ValidateIf((_o, v) => typeof v === 'string' && v.trim().length > 0)
  @IsString()
  @MinLength(16, {
    message: 'GAME_SERVER_API_KEY must be at least 16 characters when set',
  })
  GAME_SERVER_API_KEY?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(24 * 60)
  LOBBY_TTL_MINUTES?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(24 * 60)
  LOBBY_DEFAULT_DURATION_MINUTES?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  LOBBY_CREATE_LIMIT_PER_HOUR?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  LOBBY_CREATE_LIMIT_PER_DAY?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  LOBBY_INQUIRY_LIMIT_PER_HOUR?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  LOBBY_CLEANUP_AGE_DAYS?: number;
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const withDefaults = {
    FRONTEND_URL: 'http://localhost:4200',
    BACKEND_URL: 'http://localhost:3000',
    JWT_EXPIRES_IN: '7d',
    FRONTEND_AUTH_CALLBACK_PATH: '/auth/callback',
    LOBBY_TTL_MINUTES: 120,
    LOBBY_DEFAULT_DURATION_MINUTES: 180,
    LOBBY_CREATE_LIMIT_PER_HOUR: 5,
    LOBBY_CREATE_LIMIT_PER_DAY: 20,
    LOBBY_INQUIRY_LIMIT_PER_HOUR: 3,
    LOBBY_CLEANUP_AGE_DAYS: 30,
    ...config,
  };

  const validated = plainToInstance(EnvironmentVariables, withDefaults, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    forbidUnknownValues: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return withDefaults;
}
