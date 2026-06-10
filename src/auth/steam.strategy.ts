import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import SteamStrategy from 'passport-steam';
import {
  steamAvatarUrlFromProfile,
  type SteamPassportProfile,
} from '../users/steam-profile.util';

export type SteamAuthUser = {
  steamId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

@Injectable()
export class SteamAuthStrategy extends PassportStrategy(
  SteamStrategy,
  'steam',
) {
  constructor(configService: ConfigService) {
    const backendBase = configService
      .getOrThrow<string>('BACKEND_URL')
      .replace(/\/$/, '');
    const apiKey = configService.get<string>('STEAM_API_KEY');
    const hasApiKey = Boolean(apiKey?.trim());

    super({
      returnURL: `${backendBase}/auth/steam/callback`,
      realm: `${backendBase}/`,
      apiKey: hasApiKey ? apiKey! : '',
      profile: hasApiKey,
      // passport-steam only forwards `req` when this is true before it forces
      // passReqToCallback internally; otherwise it calls validate(identifier, profile, done)
      // and Nest mis-binds args (identifier becomes the profile object).
      passReqToCallback: true,
    } as ConstructorParameters<typeof SteamStrategy>[0]);
  }

  validate(
    _req: Request,
    identifier: unknown,
    profile: SteamPassportProfile | undefined,
  ): SteamAuthUser {
    const idFromOpenId =
      typeof identifier === 'string'
        ? identifier.match(/\/(\d{17})$/)?.[1]
        : null;
    const steamId = profile?.id ?? idFromOpenId ?? null;
    if (!steamId) {
      throw new Error('Could not resolve Steam ID');
    }
    return {
      steamId,
      displayName: profile?.displayName ?? null,
      avatarUrl: steamAvatarUrlFromProfile(profile),
    };
  }
}
