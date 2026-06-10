import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { JwtAuthUser } from './jwt.strategy';
import type { SteamAuthUser } from './steam.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Get('steam')
  @UseGuards(AuthGuard('steam'))
  steamLogin(): void {
    /* Passport redirects to Steam */
  }

  @Get('steam/callback')
  @Post('steam/callback')
  @UseGuards(AuthGuard('steam'))
  async steamCallback(
    @Req() req: { user: SteamAuthUser },
    @Res() res: Response,
  ): Promise<void> {
    const user = await this.usersService.findOrCreateFromSteam(
      req.user.steamId,
      {
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl,
      },
    );
    const token = this.authService.signJwt(user);
    const frontendBase = this.configService
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
    const path =
      this.configService.get<string>('FRONTEND_AUTH_CALLBACK_PATH') ??
      '/auth/callback';
    const suffix = path.startsWith('/') ? path : `/${path}`;
    const target = new URL(`${frontendBase}${suffix}`);
    target.searchParams.set('access_token', token);
    res.redirect(target.toString());
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() req: { user: JwtAuthUser }): Promise<{
    steamId: string;
    isAdmin: boolean;
    displayName: string | null;
    avatarUrl: string | null;
  }> {
    const user = await this.usersService.findBySteamId(req.user.steamId);
    return {
      steamId: req.user.steamId,
      isAdmin: user?.isAdmin ?? req.user.isAdmin,
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
    };
  }
}
