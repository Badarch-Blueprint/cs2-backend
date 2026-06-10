import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team } from './team.entity';
import { TeamMember } from './team-member.entity';
import type { CreateTeamMemberDto } from './dto/create-team-member.dto';

export type TeamMemberViewDto = {
  id: string;
  name: string;
  steamId: string;
  isCaptain: boolean;
};

export type TeamViewDto = {
  id: string;
  name: string;
  createdAt: string;
  members: TeamMemberViewDto[];
};

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
  ) {}

  async listTeams(): Promise<{ teams: TeamViewDto[] }> {
    const teams = await this.teamRepo.find({
      relations: { members: true },
      order: { createdAt: 'DESC' },
    });
    for (const t of teams) {
      t.members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    return { teams: teams.map((t) => this.toTeamView(t)) };
  }

  async createTeam(name: string): Promise<TeamViewDto> {
    const trimmed = name.trim();
    const team = this.teamRepo.create({ name: trimmed });
    const saved = await this.teamRepo.save(team);
    return this.toTeamView({ ...saved, members: [] });
  }

  async deleteTeam(teamId: string): Promise<void> {
    const res = await this.teamRepo.delete({ id: teamId });
    if (!res.affected) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
  }

  async addMember(
    teamId: string,
    dto: CreateTeamMemberDto,
  ): Promise<TeamMemberViewDto> {
    const team = await this.teamRepo.findOne({
      where: { id: teamId },
      relations: { members: true },
    });
    if (!team) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
    const steamId = dto.steamId.trim();
    const dup = team.members.find((m) => m.steamId === steamId);
    if (dup) {
      throw new ConflictException(
        `Member with Steam ID "${steamId}" already exists on this team`,
      );
    }
    const isFirst = team.members.length === 0;
    const member = this.memberRepo.create({
      teamId,
      name: dto.name.trim(),
      steamId,
      isCaptain: isFirst,
    });
    const saved = await this.memberRepo.save(member);
    return this.toMemberView(saved);
  }

  async removeMember(teamId: string, memberId: string): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, teamId },
    });
    if (!member) {
      throw new NotFoundException(`Member ${memberId} not found on team`);
    }
    const wasCaptain = member.isCaptain;
    await this.memberRepo.delete({ id: memberId, teamId });
    if (wasCaptain) {
      const remaining = await this.memberRepo.find({
        where: { teamId },
        order: { createdAt: 'ASC' },
      });
      const nextCaptain = remaining[0];
      if (nextCaptain) {
        await this.memberRepo.update(
          { id: nextCaptain.id },
          { isCaptain: true },
        );
      }
    }
  }

  async setCaptain(teamId: string, memberId: string): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, teamId },
    });
    if (!member) {
      throw new NotFoundException(`Member ${memberId} not found on team`);
    }
    await this.memberRepo.manager.transaction(async (em) => {
      await em
        .getRepository(TeamMember)
        .update({ teamId }, { isCaptain: false });
      await em
        .getRepository(TeamMember)
        .update({ id: memberId, teamId }, { isCaptain: true });
    });
  }

  private toMemberView(m: TeamMember): TeamMemberViewDto {
    return {
      id: m.id,
      name: m.name,
      steamId: m.steamId,
      isCaptain: m.isCaptain,
    };
  }

  private toTeamView(t: Team & { members?: TeamMember[] }): TeamViewDto {
    const members = (t.members ?? []).map((m) => this.toMemberView(m));
    return {
      id: t.id,
      name: t.name,
      createdAt: t.createdAt.toISOString(),
      members,
    };
  }
}
