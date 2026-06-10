import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Shared secret for the game-server → API integration (`GAME_SERVER_API_KEY`).
 * Send `X-Game-Server-Token: <key>` on each request.
 */
@Injectable()
export class GameServerAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('GAME_SERVER_API_KEY')?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        'Game server integration is disabled (set GAME_SERVER_API_KEY).',
      );
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header =
      (typeof req.headers['x-game-server-token'] === 'string'
        ? req.headers['x-game-server-token']
        : undefined) ??
      (typeof req.headers['x-gameserver-token'] === 'string'
        ? req.headers['x-gameserver-token']
        : undefined);
    const token = header?.trim();
    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing game server token');
    }
    return true;
  }
}
