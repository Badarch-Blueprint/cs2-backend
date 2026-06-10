import { ConfigService } from '@nestjs/config';

import type { Lobby } from '../entities/lobby.entity';
import type { LobbyMember } from '../entities/lobby-member.entity';
import type { RentalServer } from '../entities/rental-server.entity';
import { LobbyBroadcastService } from '../lobby-broadcast.service';
import { LobbyLifecycleScheduler } from '../lobby-lifecycle.scheduler';

type AnyRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
};

function repoStub(): AnyRepo {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (v) => v),
  };
}

function makeLobby(overrides: Partial<Lobby> = {}): Lobby {
  return {
    id: overrides.id ?? 'lobby-1',
    inviteCode: 'ABC123',
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
    expiresAt: new Date(),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    rentalServer: null,
    toJSON: () => ({}),
    ...overrides,
  } as Lobby;
}

function makeMember(o: Partial<LobbyMember>): LobbyMember {
  return {
    id: o.id ?? 'm-1',
    lobbyId: o.lobbyId ?? 'lobby-1',
    userId: o.userId ?? 'u-1',
    team: o.team ?? 'A',
    role: o.role ?? 'MEMBER',
    isReady: o.isReady ?? false,
    joinedAt: o.joinedAt ?? new Date(),
    leftAt: o.leftAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lobby: {} as Lobby,
    ...o,
  } as LobbyMember;
}

function makeRental(o: Partial<RentalServer>): RentalServer {
  return {
    id: o.id ?? 'r-1',
    lobbyId: o.lobbyId ?? 'lobby-1',
    matchId: null,
    status: o.status ?? 'READY',
    host: '10.0.0.1',
    port: 27015,
    gotvPort: 27020,
    connectString: 'connect 10.0.0.1:27015',
    startedAt: new Date(),
    endsAt: o.endsAt ?? new Date(),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lobby: {} as Lobby,
    ...o,
  } as RentalServer;
}

describe('LobbyLifecycleScheduler', () => {
  function build() {
    const lobbies = repoStub();
    const members = repoStub();
    const servers = repoStub();
    const matches = repoStub();
    const broadcast = { emit: jest.fn(), emitToSteamIds: jest.fn(), attachServer: jest.fn() } as unknown as LobbyBroadcastService;
    const config = { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService;
    const scheduler = new LobbyLifecycleScheduler(
      lobbies as never,
      members as never,
      servers as never,
      matches as never,
      config,
      broadcast,
    );
    return { scheduler, lobbies, members, servers, matches, broadcast };
  }

  it('expires WAITING lobbies past expiresAt and clears members', async () => {
    const lobby = makeLobby({
      id: 'l-expired',
      status: 'WAITING',
      expiresAt: new Date(Date.now() - 1000),
    });
    const member = makeMember({ lobbyId: lobby.id, userId: 'host', isReady: true });
    const { scheduler, lobbies, members, broadcast } = build();
    lobbies.find.mockResolvedValueOnce([lobby]);
    members.find.mockResolvedValueOnce([member]);

    const count = await scheduler.expireAbandonedLobbies();

    expect(count).toBe(1);
    expect(lobby.status).toBe('EXPIRED');
    expect(member.leftAt).not.toBeNull();
    expect(member.isReady).toBe(false);
    expect(lobbies.save).toHaveBeenCalledWith(lobby);
    expect(broadcast.emit).toHaveBeenCalledWith(
      lobby.id,
      'lobby.status.changed',
      { from: 'WAITING', to: 'EXPIRED' },
    );
    expect(broadcast.emit).toHaveBeenCalledWith(
      lobby.id,
      'lobby.cancelled',
      { reason: 'expired' },
    );
  });

  it('marks linked match FINISHED when rental endsAt passes', async () => {
    const lobby = makeLobby({ id: 'l-live', status: 'STARTED', matchId: 'm-1' });
    const rental = makeRental({
      lobbyId: lobby.id,
      status: 'ACTIVE',
      endsAt: new Date(Date.now() - 1000),
    });
    lobby.rentalServerId = rental.id;
    const match = { id: 'm-1', status: 'LIVE', endAt: null } as any;
    const { scheduler, lobbies, servers, matches, broadcast } = build();
    servers.find.mockResolvedValueOnce([rental]);
    lobbies.findOne.mockResolvedValueOnce(lobby);
    matches.findOne.mockResolvedValueOnce(match);

    const count = await scheduler.expireFinishedRentals();

    expect(count).toBe(1);
    expect(rental.status).toBe('EXPIRED');
    expect(rental.connectString).toBeNull();
    expect(match.status).toBe('FINISHED');
    expect(broadcast.emit).toHaveBeenCalledWith(
      lobby.id,
      'lobby.match.statusChanged',
      { matchId: 'm-1', status: 'FINISHED' },
    );
  });

  it('soft-deletes terminal lobbies older than the cleanup threshold', async () => {
    const lobby = makeLobby({
      id: 'l-old',
      status: 'CANCELLED',
      updatedAt: new Date(Date.now() - 999 * 24 * 60 * 60 * 1000),
      rentalServerId: 'r-old',
    });
    const rental = makeRental({ id: 'r-old', lobbyId: lobby.id });
    const { scheduler, lobbies, servers } = build();
    lobbies.find.mockResolvedValueOnce([lobby]);
    servers.findOne.mockResolvedValueOnce(rental);

    const count = await scheduler.softDeleteTerminal();

    expect(count).toBe(1);
    expect(lobby.deletedAt).toBeInstanceOf(Date);
    expect(rental.deletedAt).toBeInstanceOf(Date);
  });
});
