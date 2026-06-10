import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type JwtPayload = {
  readonly sub: string;
  readonly isAdmin: boolean;
};

/**
 * Shape of `req.user` for routes protected with `AuthGuard('jwt')`.
 * `sub` in the token is the Steam ID (see {@link AuthService.signJwt}).
 */
export type JwtAuthUser = {
  readonly steamId: string;
  readonly isAdmin: boolean;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtAuthUser {
    return {
      steamId: payload.sub,
      isAdmin: payload.isAdmin,
    };
  }
}
