import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BracketTeam } from '../brackets/bracket-team.entity';
import { Match } from './match.entity';
import { ZoneMatchesService } from './zone-matches.service';

@Module({
  imports: [TypeOrmModule.forFeature([Match, BracketTeam])],
  providers: [ZoneMatchesService],
  exports: [ZoneMatchesService, TypeOrmModule.forFeature([Match])],
})
export class MatchesModule {}
