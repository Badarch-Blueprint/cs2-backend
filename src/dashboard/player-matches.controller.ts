import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import type { JwtAuthUser } from '../auth/jwt.strategy';
import { VetoBanDto } from './dto/veto-ban.dto';
import { VetoSideDto } from './dto/veto-side.dto';
import { PlayerDashboardService } from './player-dashboard.service';
import { PlayerMatchVetoService } from './player-match-veto.service';

type AuthedRequest = Request & { user: JwtAuthUser };

@Controller('matches')
@UseGuards(AuthGuard('jwt'))
export class PlayerMatchesController {
  constructor(
    private readonly playerDashboard: PlayerDashboardService,
    private readonly matchVeto: PlayerMatchVetoService,
  ) {}

  @Get()
  listMatches(
    @Query('status') status?: string,
    @Query('group') group?: string,
  ) {
    return this.playerDashboard.listMatches({ status, group });
  }

  /** Map veto UI state (members of team A or B only). */
  @Get(':matchId/veto')
  getVeto(@Param('matchId') matchId: string, @Req() req: AuthedRequest) {
    return this.matchVeto.getVetoState(matchId, req.user.steamId);
  }

  /** Captain-only ban while the match is in VETO_PHASE. */
  @Post(':matchId/veto/ban')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  postVetoBan(
    @Param('matchId') matchId: string,
    @Req() req: AuthedRequest,
    @Body() dto: VetoBanDto,
  ) {
    return this.matchVeto.banMap(matchId, req.user.steamId, dto.mapName);
  }

  /** Captain-only side pick (CT/T) for BO3 picked maps. */
  @Post(':matchId/veto/side')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  postVetoSide(
    @Param('matchId') matchId: string,
    @Req() req: AuthedRequest,
    @Body() dto: VetoSideDto,
  ) {
    return this.matchVeto.pickSide(matchId, req.user.steamId, dto.side);
  }
}
