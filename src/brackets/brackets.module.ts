import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MatchesModule } from '../matches/matches.module';
import { AdminBracketsController } from './admin-brackets.controller';
import { PlayerBracketsController } from './player-brackets.controller';
import { Team } from '../teams/team.entity';
import { Match } from '../matches/match.entity';
import { BracketTeam } from './bracket-team.entity';
import { BracketsService } from './brackets.service';
import { PlayoffBracket } from './playoff-bracket.entity';
import { AdminGuard } from './guards/admin.guard';
import { ZonePlayoffSeederService } from './zone-playoff-seeder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BracketTeam, PlayoffBracket, Team, Match]),
    MatchesModule,
    AuthModule,
  ],
  controllers: [AdminBracketsController, PlayerBracketsController],
  providers: [BracketsService, AdminGuard, ZonePlayoffSeederService],
  exports: [BracketsService, ZonePlayoffSeederService],
})
export class BracketsModule {}
