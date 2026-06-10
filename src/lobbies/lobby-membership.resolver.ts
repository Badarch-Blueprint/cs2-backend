import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { LobbyMember } from './entities/lobby-member.entity';

/**
 * Lightweight membership oracle used by the `/veto` gateway to gate
 * `subscribe_lobby`. Kept separate from {@link LobbiesService} so the
 * gateway (which lives in the Dashboard module) can depend on this tiny
 * service without pulling the whole lobby module into Dashboard.
 */
@Injectable()
export class LobbyMembershipResolver {
  constructor(
    @InjectRepository(LobbyMember)
    private readonly membersRepo: Repository<LobbyMember>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async isMemberBySteamId(lobbyId: string, steamId: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { steamId } });
    if (!user) {
      return false;
    }
    const member = await this.membersRepo.findOne({
      where: { lobbyId, userId: user.id, leftAt: IsNull() },
    });
    return member != null;
  }
}
