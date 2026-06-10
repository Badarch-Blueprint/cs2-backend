import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { applyGlobalApiPrefix } from '../src/configure-http-api';

describe('Player dashboard & matches API (e2e)', () => {
  let app: INestApplication<App>;
  let userToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalApiPrefix(app);
    await app.init();

    const auth = app.get(AuthService);
    userToken = auth.signJwt({ steamId: 'e2e-dashboard-user', isAdmin: false });
  });

  afterAll(async () => {
    await app.close();
  });

  const authHdr = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('GET /api/dashboard/summary returns 401 without JWT', async () => {
    await request(app.getHttpServer()).get('/api/dashboard/summary').expect(401);
  });

  it('GET /api/dashboard/summary returns summary for a player JWT', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set(authHdr(userToken))
      .expect(200);

    const body = res.body as {
      team: unknown;
      liveMatches: unknown[];
      upcomingMatches: unknown[];
      recentMatches: unknown[];
      activeTournaments: unknown[];
    };
    expect(body).toHaveProperty('team');
    expect(Array.isArray(body.liveMatches)).toBe(true);
    expect(Array.isArray(body.upcomingMatches)).toBe(true);
    expect(Array.isArray(body.recentMatches)).toBe(true);
    expect(Array.isArray(body.activeTournaments)).toBe(true);
  });

  it('GET /api/matches returns 401 without JWT', async () => {
    await request(app.getHttpServer()).get('/api/matches').expect(401);
  });

  it('GET /api/matches returns { matches } for a player JWT', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/matches')
      .set(authHdr(userToken))
      .expect(200);

    const body = res.body as { matches: unknown[] };
    expect(Array.isArray(body.matches)).toBe(true);
  });

  it('GET /api/brackets/zones-preview returns 401 without JWT', async () => {
    await request(app.getHttpServer()).get('/api/brackets/zones-preview').expect(401);
  });

  it('GET /api/brackets/zones-preview returns groups + zoneMatches for a player JWT', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/brackets/zones-preview')
      .set(authHdr(userToken))
      .expect(200);

    const body = res.body as {
      groups: unknown[];
      zoneMatches: Record<string, unknown>;
      playoffs: { matches?: unknown[] };
    };
    expect(Array.isArray(body.groups)).toBe(true);
    expect(body.zoneMatches).toBeDefined();
    expect(typeof body.zoneMatches).toBe('object');
    for (const code of ['A', 'B', 'C', 'D']) {
      expect(body.zoneMatches).toHaveProperty(code);
      const z = body.zoneMatches[code] as { rounds?: unknown };
      expect(Array.isArray(z.rounds)).toBe(true);
    }
    expect(body.playoffs).toBeDefined();
    expect(Array.isArray(body.playoffs.matches)).toBe(true);
  });
});
