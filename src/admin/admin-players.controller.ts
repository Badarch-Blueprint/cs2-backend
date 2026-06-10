import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminGuard } from '../brackets/guards/admin.guard';
import { User } from '../users/user.entity';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminPlayersController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** All signed-up users (`users` table). Angular admin team picker calls this. */
  @Get('players')
  async listSignedUpUsers(): Promise<{
    players: Array<{
      id: string;
      displayName: string;
      steamId: string;
      isAdmin: boolean;
    }>;
  }> {
    const rows = await this.users.find({
      order: { createdAt: 'ASC' },
    });
    return {
      players: rows.map((u) => ({
        id: u.id,
        displayName: u.displayName?.trim() ? u.displayName : u.steamId,
        steamId: u.steamId,
        isAdmin: u.isAdmin,
      })),
    };
  }
}
