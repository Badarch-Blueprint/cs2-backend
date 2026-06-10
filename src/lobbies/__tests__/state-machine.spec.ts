import { ConfigService } from '@nestjs/config';

import { LobbiesService } from '../lobbies.service';
import { LobbyBroadcastService } from '../lobby-broadcast.service';
import type { Lobby } from '../entities/lobby.entity';
import type { LobbyMember } from '../entities/lobby-member.entity';

type AnyRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneByOrFail: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function stubRepo(): AnyRepo {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneByOrFail: jest.fn(),
    save: jest.fn(async (v) => v),
    create: jest.fn((v) => v),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  };
}

function makeLobby(overrides: Partial<Lobby> = {}): Lobby {
  return {
    id: 'lobby-1',
    inviteCode: 'ABCDEF',
    hostUserId: 'host',
    mode: 'BO3',
    name: 'n',
    region: 'MN',
    serverPassword: null,
    features: { cstv: false, demo: false, skinChanger: false, highLight: false },
    status: 'WAITING',
    teamSize: 5,
    matchId: null,
    rentalServerId: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    rentalServer: null,
    toJSON: () => ({}),
    ...overrides,
  } as Lobby;
}

function makeMember(overrides: Partial<LobbyMember>): LobbyMember {
  return {
    id: 'm-1',
    lobbyId: 'lobby-1',
    userId: 'u-1',
    team: 'A',
    role: 'MEMBER',
    isReady: false,
    joinedAt: new Date(),
    leftAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lobby: {} as Lobby,
    ...overrides,
  } as LobbyMember;
}

function build(lobby: Lobby, members: LobbyMember[]) {
  const lobbyRepo = stubRepo();
  const memberRepo = stubRepo();
  const serverRepo = stubRepo();
  const userRepo = stubRepo();
  const matchRepo = stubRepo();
  matchRepo.create.mockImplementation((row: Record<string, unknown>) => ({ ...row }));
  matchRepo.save.mockImplementation(async (row: { id?: string } & Record<string, unknown>) => ({
    ...row,
    id: row.id ?? 'match-at-veto',
  }));

  lobbyRepo.findOne.mockImplementation(async ({ where }) => {
    if (typeof where === 'object' && 'id' in where && where.id !== lobby.id) {
      return null;
    }
    return lobby;
  });
  memberRepo.find.mockImplementation(async ({ where }) => {
    if (typeof where === 'object' && 'lobbyId' in where && where.lobbyId === lobby.id) {
      return members.filter((m) => !m.leftAt);
    }
    return [];
  });
  memberRepo.findOne.mockImplementation(async ({ where }) => {
    const w = where as { lobbyId?: string; userId?: string };
    return (
      members.find(
        (m) =>
          (!w.lobbyId || m.lobbyId === w.lobbyId) &&
          (!w.userId || m.userId === w.userId) &&
          !m.leftAt,
      ) ?? null
    );
  });
  memberRepo.count.mockImplementation(async ({ where }) => {
    const w = where as { team?: string };
    return members.filter((m) => !m.leftAt && m.team === w.team).length;
  });
  userRepo.findOne.mockResolvedValue({ id: 'host', steamId: '123' });

  const broadcast = { emit: jest.fn(), emitToSteamIds: jest.fn(), attachServer: jest.fn() } as unknown as LobbyBroadcastService;
  const config = { get: jest.fn().mockReturnValue(120) } as unknown as ConfigService;

  const svc = new LobbiesService(
    lobbyRepo as never,
    memberRepo as never,
    serverRepo as never,
    userRepo as never,
    matchRepo as never,
    config,
    broadcast,
  );
  return { svc, lobbyRepo, memberRepo, serverRepo, matchRepo, broadcast };
}

describe('LobbiesService state machine', () => {
  it('rejects /start when a team has no players', async () => {
    const lobby = makeLobby({ hostUserId: 'host' });
    const members = [makeMember({ userId: 'host', role: 'HOST', team: 'A' })];
    const { svc } = build(lobby, members);
    await expect(
      svc.start(
        { userId: 'host', steamId: '123', isAdmin: false },
        lobby.id,
      ),
    ).rejects.toThrow(/at least one player/i);
  });

  it('advances WAITING→READY_CHECK when both teams have players but not everyone is ready', async () => {
    const lobby = makeLobby();
    const members = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeMember({
          userId: i === 0 ? 'host' : `a${i}`,
          team: 'A',
          role: i === 0 ? 'HOST' : 'MEMBER',
          isReady: false,
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeMember({ userId: `b${i}`, team: 'B', role: i === 0 ? 'CAPTAIN' : 'MEMBER', isReady: false }),
      ),
    ];
    const { svc, matchRepo } = build(lobby, members);
    const res = await svc.start({ userId: 'host', steamId: '123', isAdmin: false }, lobby.id);
    expect(res.transitionedToStarted).toBe(false);
    expect(lobby.status).toBe('READY_CHECK');
    expect(matchRepo.create).not.toHaveBeenCalled();
  });

  it('advances WAITING→STARTED when everybody already ready', async () => {
    const lobby = makeLobby();
    const members = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeMember({
          userId: i === 0 ? 'host' : `a${i}`,
          team: 'A',
          role: i === 0 ? 'HOST' : 'MEMBER',
          isReady: true,
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeMember({ userId: `b${i}`, team: 'B', role: i === 0 ? 'CAPTAIN' : 'MEMBER', isReady: true }),
      ),
    ];
    const { svc, broadcast, matchRepo } = build(lobby, members);
    const res = await svc.start({ userId: 'host', steamId: '123', isAdmin: false }, lobby.id);
    expect(res.transitionedToStarted).toBe(true);
    expect(lobby.status).toBe('STARTED');
    expect(lobby.matchId).toBe('match-at-veto');
    expect(matchRepo.create).toHaveBeenCalled();
    expect(matchRepo.save).toHaveBeenCalled();
    expect(broadcast.emit).toHaveBeenCalledWith(
      lobby.id,
      'lobby.status.changed',
      { from: 'WAITING', to: 'STARTED' },
    );
  });

  it('advances WAITING→STARTED for 1v1 when both players are ready', async () => {
    const lobby = makeLobby();
    const members = [
      makeMember({ userId: 'host', role: 'HOST', team: 'A', isReady: true }),
      makeMember({ userId: 'guest', role: 'CAPTAIN', team: 'B', isReady: true }),
    ];
    const { svc, broadcast, matchRepo } = build(lobby, members);
    const res = await svc.start({ userId: 'host', steamId: '123', isAdmin: false }, lobby.id);
    expect(res.transitionedToStarted).toBe(true);
    expect(lobby.status).toBe('STARTED');
    expect(lobby.matchId).toBe('match-at-veto');
    expect(matchRepo.create).toHaveBeenCalled();
    expect(broadcast.emit).toHaveBeenCalledWith(
      lobby.id,
      'lobby.status.changed',
      { from: 'WAITING', to: 'STARTED' },
    );
  });

  it('forbids non-host from /cancel', async () => {
    const lobby = makeLobby({ hostUserId: 'host' });
    const members = [
      makeMember({ userId: 'host', role: 'HOST', team: 'A' }),
      makeMember({ userId: 'other', role: 'MEMBER', team: 'B' }),
    ];
    const { svc } = build(lobby, members);
    await expect(
      svc.cancel({ userId: 'other', steamId: '999', isAdmin: false }, lobby.id),
    ).rejects.toThrow(/host/i);
  });

  it('transfers host to longest-tenured captain when host leaves', async () => {
    const lobby = makeLobby({ hostUserId: 'host' });
    const old = new Date(Date.now() - 10_000_000);
    const newer = new Date(Date.now() - 1_000);
    const hostMember = makeMember({ userId: 'host', role: 'HOST', team: 'A', joinedAt: old });
    const captainA = makeMember({ userId: 'a-cap', role: 'CAPTAIN', team: 'A', joinedAt: newer });
    const captainB = makeMember({ userId: 'b-cap', role: 'CAPTAIN', team: 'B', joinedAt: old });
    const { svc, lobbyRepo, memberRepo } = build(lobby, [hostMember, captainA, captainB]);
    // After leave, listActiveMembers returns remaining (non-left) members.
    memberRepo.find.mockImplementation(async () =>
      [hostMember, captainA, captainB].filter((m) => !m.leftAt),
    );
    await svc.leave({ userId: 'host', steamId: '123', isAdmin: false }, lobby.id);
    expect(lobby.hostUserId).toBe('a-cap');
    expect(captainA.role).toBe('HOST');
    expect(lobbyRepo.save).toHaveBeenCalled();
  });
});
