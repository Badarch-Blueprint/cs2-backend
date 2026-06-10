import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { applyGlobalApiPrefix } from '../src/configure-http-api';
import { AuthService } from '../src/auth/auth.service';

describe('Admin teams API (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalApiPrefix(app);
    await app.init();

    adminToken = app.get(AuthService).signJwt({ steamId: 'e2e-admin-teams', isAdmin: true });
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('GET /api/admin/teams returns list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/teams')
      .set(auth(adminToken))
      .expect(200);

    expect(Array.isArray((res.body as { teams: unknown[] }).teams)).toBe(true);
  });

  it('POST create, add member, captain, remove member, delete team', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/teams')
      .set(auth(adminToken))
      .send({ name: 'E2E Test Squad' })
      .expect(201);

    const teamId = (created.body as { id: string }).id;
    expect(teamId).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/admin/teams/${teamId}/members`)
      .set(auth(adminToken))
      .send({ name: 'Player One', steamId: '76561198000000001' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/teams/${teamId}/members`)
      .set(auth(adminToken))
      .send({ name: 'Player Two', steamId: '76561198000000002' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/admin/teams')
      .set(auth(adminToken))
      .expect(200);

    const team = (list.body as { teams: { id: string; members: { id: string }[] }[] }).teams.find(
      (t) => t.id === teamId,
    );
    expect(team?.members).toHaveLength(2);
    const member2 = team!.members[1];

    await request(app.getHttpServer())
      .post(`/api/admin/teams/${teamId}/members/${member2.id}/captain`)
      .set(auth(adminToken))
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/api/admin/teams/${teamId}/members/${member2.id}`)
      .set(auth(adminToken))
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/api/admin/teams/${teamId}`)
      .set(auth(adminToken))
      .expect(204);
  });
});
