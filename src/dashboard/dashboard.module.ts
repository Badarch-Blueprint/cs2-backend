import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { LobbiesModule } from '../lobbies/lobbies.module';
import { Match } from '../matches/match.entity';
import { TeamMember } from '../teams/team-member.entity';
import { User } from '../users/user.entity';
import { DashboardController } from './dashboard.controller';
import { PlayerMatchesController } from './player-matches.controller';
import { PlayerDashboardService } from './player-dashboard.service';
import { Cs2OrchestratorBridgeService } from './cs2-orchestrator-bridge.service';
import { MatchVetoBroadcastService } from './match-veto-broadcast.service';
import { MatchVetoGateway } from './match-veto.gateway';
import { PlayerMatchVetoService } from './player-match-veto.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Match, TeamMember, User]),
    forwardRef(() => LobbiesModule),
  ],
  controllers: [DashboardController, PlayerMatchesController],
  providers: [
    PlayerDashboardService,
    PlayerMatchVetoService,
    Cs2OrchestratorBridgeService,
    MatchVetoBroadcastService,
    MatchVetoGateway,
  ],
  exports: [Cs2OrchestratorBridgeService, MatchVetoBroadcastService],
})
export class DashboardModule {}
