import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

export type SteamProfileInput = {
  displayName: string | null;
  avatarUrl: string | null;
};

type SteamApiPlayer = {
  personaname?: string;
  avatarfull?: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  private bootstrapAdminSteamIds(): Set<string> {
    const raw = this.configService.get<string>('BOOTSTRAP_ADMIN_STEAM_IDS');
    if (!raw?.trim()) {
      return new Set();
    }
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  private steamWebApiKey(): string | undefined {
    return this.configService.get<string>('STEAM_API_KEY')?.trim() || undefined;
  }

  private async fetchPlayerFromSteamWebApi(
    steamId: string,
  ): Promise<SteamProfileInput | null> {
    const key = this.steamWebApiKey();
    if (!key) {
      return null;
    }
    const url = new URL(
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
    );
    url.searchParams.set('key', key);
    url.searchParams.set('steamids', steamId);
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as {
      response?: { players?: SteamApiPlayer[] };
    };
    const p = body.response?.players?.[0];
    if (!p) {
      return null;
    }
    return {
      displayName: p.personaname ?? null,
      avatarUrl: p.avatarfull ?? null,
    };
  }

  async findBySteamId(steamId: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { steamId } });
  }

  async findOrCreateFromSteam(
    steamId: string,
    profile?: SteamProfileInput,
  ): Promise<User> {
    const adminIds = this.bootstrapAdminSteamIds();
    const promoteAdmin = adminIds.has(steamId);

    let displayName = profile?.displayName ?? null;
    let avatarUrl = profile?.avatarUrl ?? null;
    if ((!avatarUrl || !displayName) && this.steamWebApiKey()) {
      const fromApi = await this.fetchPlayerFromSteamWebApi(steamId);
      if (fromApi) {
        displayName = displayName ?? fromApi.displayName;
        avatarUrl = avatarUrl ?? fromApi.avatarUrl;
      }
    }

    let user = await this.usersRepo.findOne({ where: { steamId } });

    if (!user) {
      user = this.usersRepo.create({
        steamId,
        displayName,
        avatarUrl,
        isAdmin: promoteAdmin,
      });
      return this.usersRepo.save(user);
    }

    let changed = false;
    if (promoteAdmin && !user.isAdmin) {
      user.isAdmin = true;
      changed = true;
    }
    if (displayName != null && displayName !== user.displayName) {
      user.displayName = displayName;
      changed = true;
    }
    if (avatarUrl != null && avatarUrl !== user.avatarUrl) {
      user.avatarUrl = avatarUrl;
      changed = true;
    }
    if (changed) {
      await this.usersRepo.save(user);
    }
    return user;
  }
}
