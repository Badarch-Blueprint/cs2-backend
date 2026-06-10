import { Controller, Get, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { ZoneMatchesService } from '../matches/zone-matches.service';
import { BracketsService } from './brackets.service';

/**
 * Authenticated player routes for read-only bracket data (no {@link AdminGuard}).
 */
@Controller('brackets')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PlayerBracketsController {
  constructor(
    private readonly brackets: BracketsService,
    private readonly zoneMatches: ZoneMatchesService,
  ) {}

  /**
   * Swiss group rosters, zone round-robin pairings, and playoff bracket (read-only;
   * same shapes as admin `GET /admin/brackets` + zone-matches, without mutation routes).
   */
  @Get('zones-preview')
  async zonesPreview() {
    const [full, zoneMatches] = await Promise.all([
      this.brackets.getFullBracket(),
      this.zoneMatches.listAllZoneMatches(),
    ]);
    return {
      groups: full.groups,
      zoneMatches,
      playoffs: full.playoffs,
    };
  }
}
