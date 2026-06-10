import {
  Body,
  Controller,
  Param,
  Get,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AdminGuard } from '../brackets/guards/admin.guard';
import { PromoteRoundToVetoPhaseDto } from './dto/promote-round-to-veto-phase.dto';
import { AdminMatchesService } from './admin-matches.service';

@Controller('admin/matches')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminMatchesController {
  constructor(private readonly adminMatches: AdminMatchesService) {}

  /** Full match list for the admin matches screen (all rows, newest first). */
  @Get()
  listMatches() {
    return this.adminMatches.listAll();
  }

  @Post('actions/promote-round-to-veto-phase')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  promoteRoundToVetoPhase(@Body() dto: PromoteRoundToVetoPhaseDto) {
    return this.adminMatches.promoteRoundScheduledToVetoPhase(dto);
  }

  @Post(':matchId/actions/tech-pause')
  takeTechPause(@Param('matchId') matchId: string) {
    return this.adminMatches.takeTechPause(matchId);
  }

  @Post(':matchId/actions/force-start')
  forceStart(@Param('matchId') matchId: string) {
    return this.adminMatches.forceStart(matchId);
  }

  @Post(':matchId/actions/boot-from-backup')
  bootFromBackup(@Param('matchId') matchId: string) {
    return this.adminMatches.bootFromBackup(matchId);
  }

  @Post(':matchId/actions/manual-start')
  manualStart(@Param('matchId') matchId: string) {
    return this.adminMatches.manualStart(matchId);
  }
}
