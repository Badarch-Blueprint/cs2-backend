import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { applyGlobalApiPrefix } from '../src/configure-http-api';
import type {
  BracketGroupViewDto,
  PlayoffBracketViewDto,
} from '../src/brackets/brackets.service';

describe('Admin brackets API (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalApiPrefix(app);
    await app.init();

    const auth = app.get(AuthService);
    adminToken = auth.signJwt({ steamId: 'e2e-admin', isAdmin: true });
    userToken = auth.signJwt({ steamId: 'e2e-user', isAdmin: false });
  });

  afterAll(async () => {
    await app.close();
  });

  const authHdr = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createTeam(name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/admin/teams')
      .set(authHdr(adminToken))
      .send({ name })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  it('GET /api/admin/brackets returns padded groups (A=6 slots, B–D=5)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/brackets')
      .set(authHdr(adminToken))
      .expect(200);

    const { groups, playoffs } = res.body as {
      groups: BracketGroupViewDto[];
      playoffs: PlayoffBracketViewDto;
    };
    expect(groups).toHaveLength(4);
    expect(playoffs.matches).toHaveLength(7);
    for (const m of playoffs.matches) {
      expect(m.slots).toHaveLength(2);
      expect(m.slots[0]?.teamName).toBeNull();
      expect(m.slots[1]?.teamName).toBeNull();
    }
    const a = groups.find((g) => g.code === 'A');
    const b = groups.find((g) => g.code === 'B');
    expect(a?.slotCount).toBe(6);
    expect(a?.slots).toHaveLength(6);
    expect(b?.slotCount).toBe(5);
    expect(b?.slots).toHaveLength(5);
    for (const slot of a!.slots) {
      expect(slot.teamId).toBeNull();
      expect(slot.teamName).toBeNull();
    }
  });

  it('rejects non-admin JWT with 403', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/brackets')
      .set(authHdr(userToken))
      .expect(403);
  });

  it('POST /teams assigns first free slot; GET group is case-insensitive', async () => {
    const teamId = await createTeam('Team Alpha');

    await request(app.getHttpServer())
      .post('/api/admin/brackets/groups/a/teams')
      .set(authHdr(adminToken))
      .send({ teamId })
      .expect(201);

    const g = await request(app.getHttpServer())
      .get('/api/admin/brackets/groups/a')
      .set(authHdr(adminToken))
      .expect(200);

    const body = g.body as BracketGroupViewDto;
    expect(body.code).toBe('A');
    expect(body.slots[0].teamId).toBe(teamId);
    expect(body.slots[0].teamName).toBe('Team Alpha');
    expect(body.slots[0].id).toBeTruthy();
    for (let i = 1; i < 6; i++) {
      expect(body.slots[i].teamName).toBeNull();
      expect(body.slots[i].teamId).toBeNull();
    }
  });

  it('POST with slotIndex respects capacity and conflicts', async () => {
    const idB0 = await createTeam('B0');
    const idB0Dup = await createTeam('B0-dup');

    await request(app.getHttpServer())
      .post('/api/admin/brackets/groups/B/teams')
      .set(authHdr(adminToken))
      .send({ teamId: idB0, slotIndex: 0 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/admin/brackets/groups/B/teams')
      .set(authHdr(adminToken))
      .send({ teamId: idB0Dup, slotIndex: 0 })
      .expect(409);
  });

  it('PATCH updates a filled slot', async () => {
    const idRenamed = await createTeam('B0-renamed');
    const row = await request(app.getHttpServer())
      .patch('/api/admin/brackets/groups/B/teams/0')
      .set(authHdr(adminToken))
      .send({ teamId: idRenamed })
      .expect(200);

    const body = row.body as { team?: { id: string; name: string } };
    expect(body.team?.id).toBe(idRenamed);
    expect(body.team?.name).toBe('B0-renamed');
  });

  it('PATCH on empty slot returns 404', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/brackets/groups/B/teams/4')
      .set(authHdr(adminToken))
      .send({ teamId: 'c9b131f8-0405-4ef9-9b29-a2f95d6f6d3e' })
      .expect(404);
  });

  it('DELETE clears slot; second DELETE is idempotent (204)', async () => {
    await request(app.getHttpServer())
      .delete('/api/admin/brackets/groups/B/teams/0')
      .set(authHdr(adminToken))
      .expect(204);

    await request(app.getHttpServer())
      .delete('/api/admin/brackets/groups/B/teams/0')
      .set(authHdr(adminToken))
      .expect(204);
  });

  it('PUT roster replaces whole group with exact length', async () => {
    const teams = await Promise.all([
      createTeam('t1'),
      createTeam('t2'),
      createTeam('t3'),
      createTeam('t4'),
      createTeam('t5'),
    ]);
    const res = await request(app.getHttpServer())
      .put('/api/admin/brackets/groups/c/roster')
      .set(authHdr(adminToken))
      .send({ teamIds: teams })
      .expect(200);

    const rosterBody = res.body as BracketGroupViewDto;
    expect(rosterBody.code).toBe('C');
    expect(rosterBody.slots.map((s) => s.teamId)).toEqual(teams);
    expect(rosterBody.slots.map((s) => s.teamName)).toEqual([
      't1',
      't2',
      't3',
      't4',
      't5',
    ]);

    await request(app.getHttpServer())
      .put('/api/admin/brackets/groups/c/roster')
      .set(authHdr(adminToken))
      .send({ teamIds: ['only'] as unknown as string[] })
      .expect(400);
  });

  it('PUT /api/admin/brackets/playoffs persists 14-slot roster', async () => {
    const roster = Array.from({ length: 14 }, (_, i) =>
      i % 3 === 0 ? `P${i}` : '',
    );
    const put = await request(app.getHttpServer())
      .put('/api/admin/brackets/playoffs')
      .set(authHdr(adminToken))
      .send({ roster })
      .expect(200);

    const body = put.body as PlayoffBracketViewDto;
    expect(body.matches).toHaveLength(7);
    expect(body.matches[0]?.slots[0]?.teamName).toBe('P0');
    expect(body.matches[0]?.slots[1]?.teamName).toBeNull();

    const again = await request(app.getHttpServer())
      .get('/api/admin/brackets')
      .set(authHdr(adminToken))
      .expect(200);
    const full = again.body as { playoffs: PlayoffBracketViewDto };
    expect(full.playoffs.matches[0]?.slots[0]?.teamName).toBe('P0');
  });

  it('PUT roster for group A requires 6 names', async () => {
    const six = await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => createTeam(n)),
    );
    await request(app.getHttpServer())
      .put('/api/admin/brackets/groups/A/roster')
      .set(authHdr(adminToken))
      .send({ teamIds: six })
      .expect(200);

    await request(app.getHttpServer())
      .put('/api/admin/brackets/groups/A/roster')
      .set(authHdr(adminToken))
      .send({ teamIds: six.slice(0, 5) })
      .expect(400);
  });

  it('GET /api/admin/overview returns 401 without JWT', async () => {
    await request(app.getHttpServer()).get('/api/admin/overview').expect(401);
  });

  it('GET /api/admin/overview returns 403 for non-admin JWT', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/overview')
      .set(authHdr(userToken))
      .expect(403);
  });

  it('GET /api/admin/overview returns stats and liveMatches for admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/overview')
      .set(authHdr(adminToken))
      .expect(200);

    const body = res.body as {
      stats: { totalTeams: number; totalMatches: number; liveMatchCount: number };
      liveMatches: unknown[];
    };
    expect(body.stats).toBeDefined();
    expect(typeof body.stats.totalTeams).toBe('number');
    expect(typeof body.stats.totalMatches).toBe('number');
    expect(typeof body.stats.liveMatchCount).toBe('number');
    expect(Array.isArray(body.liveMatches)).toBe(true);
  });

  it('GET /api/admin/matches returns { matches } for admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/matches')
      .set(authHdr(adminToken))
      .expect(200);
    const body = res.body as { matches: unknown[] };
    expect(Array.isArray(body.matches)).toBe(true);
  });
});
