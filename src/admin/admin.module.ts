import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../brackets/guards/admin.guard';
import { DashboardModule } from '../dashboard/dashboard.module';
import { Match } from '../matches/match.entity';
import { Team } from '../teams/team.entity';
import { User } from '../users/user.entity';
import { AdminMatchesController } from './admin-matches.controller';
import { AdminMatchesService } from './admin-matches.service';
import { AdminOverviewController } from './admin-overview.controller';
import { AdminOverviewService } from './admin-overview.service';
import { AdminPlayersController } from './admin-players.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Team, Match]),
    AuthModule,
    DashboardModule,
  ],
  controllers: [
    AdminPlayersController,
    AdminOverviewController,
    AdminMatchesController,
  ],
  providers: [AdminGuard, AdminOverviewService, AdminMatchesService],
})
export class AdminModule {}
