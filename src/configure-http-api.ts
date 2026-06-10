import { type INestApplication, RequestMethod } from '@nestjs/common';

/** Same prefix + auth exclusions as `main.ts` (keep e2e in sync). */
export function applyGlobalApiPrefix(app: INestApplication): void {
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'auth/steam', method: RequestMethod.GET },
      { path: 'auth/steam/callback', method: RequestMethod.GET },
      { path: 'auth/steam/callback', method: RequestMethod.POST },
    ],
  });
}
