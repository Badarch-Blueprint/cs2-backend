import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AdminTeamsController } from './admin-teams.controller';
import { Team } from './team.entity';
import { TeamMember } from './team-member.entity';
import { TeamsService } from './teams.service';
import { AdminGuard } from '../brackets/guards/admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Team, TeamMember]), AuthModule],
  controllers: [AdminTeamsController],
  providers: [TeamsService, AdminGuard],
})
export class TeamsModule {}
