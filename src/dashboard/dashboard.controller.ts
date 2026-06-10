import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import type { JwtAuthUser } from '../auth/jwt.strategy';
import { PlayerDashboardService } from './player-dashboard.service';

type AuthedRequest = Request & { user: JwtAuthUser };

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly playerDashboard: PlayerDashboardService) {}

  @Get('summary')
  getSummary(@Req() req: AuthedRequest) {
    return this.playerDashboard.getSummary(req.user.steamId);
  }
}
