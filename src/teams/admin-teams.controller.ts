import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../brackets/guards/admin.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { TeamsService } from './teams.service';

@Controller('admin/teams')
@UseGuards(AuthGuard('jwt'), AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminTeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list() {
    return this.teams.listTeams();
  }

  @Post()
  create(@Body() dto: CreateTeamDto) {
    return this.teams.createTeam(dto.name);
  }

  @Delete(':teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('teamId', ParseUUIDPipe) teamId: string): Promise<void> {
    await this.teams.deleteTeam(teamId);
  }

  @Post(':teamId/members')
  addMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: CreateTeamMemberDto,
  ) {
    return this.teams.addMember(teamId, dto);
  }

  @Delete(':teamId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    await this.teams.removeMember(teamId, memberId);
  }

  @Post(':teamId/members/:memberId/captain')
  @HttpCode(HttpStatus.NO_CONTENT)
  async makeCaptain(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    await this.teams.setCaptain(teamId, memberId);
  }
}
