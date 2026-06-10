import { Body, Controller, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';

import { RecordMatchResultDto } from './dto/record-match-result.dto';
import { GameServerAuthGuard } from './game-server-auth.guard';
import { GameServerMatchResultsService } from './game-server-match-results.service';

/**
 * Machine-to-machine routes for CS2 dedicated servers (or a relay) to push
 * match results into the platform API. Authenticated with {@link GameServerAuthGuard}.
 */
@Controller('integrations/game-server')
@UseGuards(GameServerAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class GameServerMatchResultsController {
  constructor(private readonly results: GameServerMatchResultsService) {}

  /**
   * Record a finished Swiss zone map. When the **last** in-progress zone map
   * becomes finished (all `Zone-*` rows settled), playoff quarterfinal names
   * are written to `playoff_brackets` from group standings.
   */
  @Post('match-results')
  recordSwissZoneResult(@Body() dto: RecordMatchResultDto) {
    return this.results.recordSwissZoneMatchResult(dto);
  }
}
