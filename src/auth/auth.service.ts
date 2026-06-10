import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  signJwt(user: Pick<User, 'steamId' | 'isAdmin'>): string {
    return this.jwtService.sign({
      sub: user.steamId,
      isAdmin: user.isAdmin,
    });
  }
}
