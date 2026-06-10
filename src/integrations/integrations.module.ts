import { Module } from '@nestjs/common';

import { BracketsModule } from '../brackets/brackets.module';
import { MatchesModule } from '../matches/matches.module';
import { GameServerAuthGuard } from './game-server-auth.guard';
import { GameServerMatchResultsController } from './game-server-match-results.controller';
import { GameServerMatchResultsService } from './game-server-match-results.service';

@Module({
  imports: [MatchesModule, BracketsModule],
  controllers: [GameServerMatchResultsController],
  providers: [GameServerMatchResultsService, GameServerAuthGuard],
})
export class IntegrationsModule {}
