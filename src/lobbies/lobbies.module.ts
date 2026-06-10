import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../brackets/guards/admin.guard';
import { Match } from '../matches/match.entity';
import { User } from '../users/user.entity';
import { AdminLobbiesController } from './admin-lobbies.controller';
import { Lobby } from './entities/lobby.entity';
import { LobbyMember } from './entities/lobby-member.entity';
import { RentalServer } from './entities/rental-server.entity';
import { TournamentInquiry } from './entities/tournament-inquiry.entity';
import { LobbiesController } from './lobbies.controller';
import { LobbiesService } from './lobbies.service';
import { LobbyBroadcastService } from './lobby-broadcast.service';
import { LobbyLifecycleScheduler } from './lobby-lifecycle.scheduler';
import { LobbyMembershipResolver } from './lobby-membership.resolver';
import { LobbyProvisioningService } from './lobby-provisioning.service';
import { TournamentInquiryService } from './tournament-inquiry.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Lobby,
      LobbyMember,
      RentalServer,
      TournamentInquiry,
      Match,
      User,
    ]),
  ],
  controllers: [LobbiesController, AdminLobbiesController],
  providers: [
    LobbiesService,
    LobbyProvisioningService,
    LobbyBroadcastService,
    LobbyMembershipResolver,
    LobbyLifecycleScheduler,
    TournamentInquiryService,
    AdminGuard,
  ],
  exports: [
    LobbiesService,
    LobbyBroadcastService,
    LobbyMembershipResolver,
    LobbyProvisioningService,
    TypeOrmModule.forFeature([Lobby, LobbyMember, RentalServer, User]),
  ],
})
export class LobbiesModule {}
