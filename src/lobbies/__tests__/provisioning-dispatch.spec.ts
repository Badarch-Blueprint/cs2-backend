import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { MatchStatus } from '../../matches/match-status.enum';
import type { Match } from '../../matches/match.entity';
import type { User } from '../../users/user.entity';
import type { Lobby } from '../entities/lobby.entity';
import type { LobbyMember } from '../entities/lobby-member.entity';
import type { RentalServer } from '../entities/rental-server.entity';
import type { LobbyProvisioningRequestedEvent } from '../lobby.events';
import { LobbyBroadcastService } from '../lobby-broadcast.service';
import { LobbyProvisioningService } from '../lobby-provisioning.service';

type AnyRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
};

function repoStub(): AnyRepo {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (v: unknown) => v),
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
    serverPassword: 'pw',
    features: { cstv: false, demo: false, skinChanger: false, highLight: false },
    status: 'PROVISIONING',
    teamSize: 5,
    matchId: 'match-1',
    rentalServerId: 'rental-1',
    expiresAt: new Date(Date.now() + 60_000),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    rentalServer: null,
    toJSON: () => ({}),
    ...overrides,
  } as Lobby;
}

function makeRental(overrides: Partial<RentalServer> = {}): RentalServer {
  return {
    id: 'rental-1',
    lobbyId: 'lobby-1',
    matchId: 'match-1',
    status: 'PROVISIONING',
    host: null,
    port: null,
    gotvPort: null,
    connectString: null,
    startedAt: null,
    endsAt: new Date(Date.now() + 3_600_000),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lobby: {} as Lobby,
    ...overrides,
  } as RentalServer;
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    status: MatchStatus.CONFIGURING_SERVER,
    mapName: 'Inferno',
    vetoBans: [],
    vetoPicks: [],
    vetoPickSides: [],
    gameServerHost: null,
    gamePort: null,
    tvPort: null,
    connectCommand: null,
    lobbyId: 'lobby-1',
    ...overrides,
  } as Match;
}

function makeMember(overrides: Partial<LobbyMember>): LobbyMember {
  return {
    id: overrides.id ?? 'm-' + Math.random().toString(36).slice(2, 6),
    lobbyId: 'lobby-1',
    userId: 'u-1',
    team: 'A',
    role: 'MEMBER',
    isReady: true,
    joinedAt: new Date(),
    leftAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lobby: {} as Lobby,
    ...overrides,
  } as LobbyMember;
}

function makeUser(overrides: Partial<User>): User {
  return {
    id: overrides.id ?? 'u-1',
    steamId: overrides.steamId ?? '765611980000',
    displayName: overrides.displayName ?? 'Player',
    avatarUrl: null,
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

function buildService(hostUrl: string | undefined) {
  const lobbies = repoStub();
  const members = repoStub();
  const servers = repoStub();
  const users = repoStub();
  const matches = repoStub();
  const broadcast = {
    emit: jest.fn(),
    emitToSteamIds: jest.fn(),
    attachServer: jest.fn(),
  } as unknown as LobbyBroadcastService;
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'CS2_HOST_URL') return hostUrl;
      if (key === 'CS2_GAME_CONNECT_HOST') return '10.0.0.1';
      return undefined;
    }),
  } as unknown as ConfigService;

  const svc = new LobbyProvisioningService(
    lobbies as never,
    members as never,
    servers as never,
    users as never,
    matches as never,
    broadcast,
    events,
    config,
  );
  return { svc, lobbies, members, servers, users, matches, broadcast, events, config };
}

function sampleEvent(): LobbyProvisioningRequestedEvent {
  return {
    lobbyId: 'lobby-1',
    matchId: 'match-1',
    rentalServerId: 'rental-1',
    mode: 'BO3',
    region: 'MN',
    features: { cstv: false, demo: false, skinChanger: false, highLight: false },
    mapName: 'Inferno',
    seriesMapIndex: 0,
    isFinalMap: false,
    vetoSeriesMaps: ['Inferno', 'Mirage', 'Nuke'],
    serverPassword: 'pw',
  };
}

async function flushHandlerPromises(): Promise<void> {
  // The @OnEvent handler fires .then/.catch chains; let them resolve.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('LobbyProvisioningService orchestrator dispatch', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.resetAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('skips the POST entirely when CS2_HOST_URL is unset', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { svc, servers, matches } = buildService(undefined);

    svc.handleProvisioningRequested(sampleEvent());
    await flushHandlerPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(servers.save).not.toHaveBeenCalled();
    expect(matches.save).not.toHaveBeenCalled();
  });

  it('applies host/port and promotes the match to LIVE when the orchestrator returns gamePort', async () => {
    const { svc, lobbies, members, servers, users, matches, broadcast } =
      buildService('http://orchestrator.local');

    const rental = makeRental();
    const lobby = makeLobby({ rentalServerId: rental.id });
    const match = makeMatch();

    const lobbyMembers = [
      makeMember({ id: 'm-a', team: 'A', userId: 'u-1' }),
      makeMember({ id: 'm-b', team: 'B', userId: 'u-2' }),
    ];
    const lobbyUsers = [
      makeUser({ id: 'u-1', steamId: '765-A', displayName: 'Alice' }),
      makeUser({ id: 'u-2', steamId: '765-B', displayName: 'Bob' }),
    ];
    members.find.mockResolvedValue(lobbyMembers);
    users.find.mockResolvedValue(lobbyUsers);
    servers.findOne.mockResolvedValue(rental);
    matches.findOne.mockResolvedValue(match);
    lobbies.findOne.mockResolvedValue(lobby);

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ matchId: 'match-1', gamePort: 27015, tvPort: 27115 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    svc.handleProvisioningRequested(sampleEvent());
    await flushHandlerPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { body: string; method: string },
    ];
    expect(url).toBe('http://orchestrator.local/api/start');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body) as {
      matchId: string;
      map: string;
      isDecider: boolean;
      team1: { name: string; players: Record<string, string> };
      team2: { name: string; players: Record<string, string> };
    };
    expect(body.matchId).toBe('match-1');
    expect(body.map).toBe('de_inferno');
    expect(body.isDecider).toBe(false);
    expect(body.team1).toEqual({ name: 'Team A', players: { '765-A': 'Alice' } });
    expect(body.team2).toEqual({ name: 'Team B', players: { '765-B': 'Bob' } });

    expect(rental.host).toBe('10.0.0.1');
    expect(rental.port).toBe(27015);
    expect(rental.gotvPort).toBe(27115);
    expect(rental.status).toBe('READY');
    expect(rental.connectString).toBe('password pw; connect 10.0.0.1:27015');
    expect(match.status).toBe(MatchStatus.LIVE);
    expect(match.gameServerHost).toBe('10.0.0.1');
    expect(match.gamePort).toBe(27015);
    expect(match.tvPort).toBe(27115);
    expect(servers.save).toHaveBeenCalledWith(rental);
    expect(matches.save).toHaveBeenCalledWith(match);
    expect(broadcast.emit).toHaveBeenCalledWith(
      'lobby-1',
      'lobby.match.statusChanged',
      { matchId: 'match-1', status: MatchStatus.LIVE },
    );
    expect(broadcast.emitToSteamIds).toHaveBeenCalledWith(
      'lobby-1',
      expect.arrayContaining(['765-A', '765-B']),
      'lobby.server.ready',
      expect.objectContaining({
        host: '10.0.0.1',
        port: 27015,
        gotvPort: 27115,
        connectString: 'password pw; connect 10.0.0.1:27015',
        map: 'Inferno',
      }),
    );
  });

  it('leaves the rental in PROVISIONING when the response has no ports (fallback to admin PATCH)', async () => {
    const { svc, members, servers, matches, broadcast } = buildService(
      'http://orchestrator.local',
    );
    members.find.mockResolvedValueOnce([]);

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'queued' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    svc.handleProvisioningRequested(sampleEvent());
    await flushHandlerPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(servers.findOne).not.toHaveBeenCalled();
    expect(servers.save).not.toHaveBeenCalled();
    expect(matches.save).not.toHaveBeenCalled();
    expect(broadcast.emit).not.toHaveBeenCalled();
  });

  it('swallows HTTP errors and leaves the rental in PROVISIONING', async () => {
    const { svc, members, servers, matches, broadcast } = buildService(
      'http://orchestrator.local',
    );
    members.find.mockResolvedValueOnce([]);

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(() => svc.handleProvisioningRequested(sampleEvent())).not.toThrow();
    await flushHandlerPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(servers.save).not.toHaveBeenCalled();
    expect(matches.save).not.toHaveBeenCalled();
    expect(broadcast.emit).not.toHaveBeenCalled();
  });
});
