import type { Namespace } from 'socket.io';

import { LobbyBroadcastService } from '../lobby-broadcast.service';

type FakeSocket = {
  id: string;
  data: { steamId?: string };
  emit: jest.Mock;
};

function makeSocket(id: string, steamId?: string): FakeSocket {
  return {
    id,
    data: steamId ? { steamId } : {},
    emit: jest.fn(),
  };
}

/**
 * Builds a minimal object that is structurally compatible with the slice of
 * `socket.io` `Namespace` we actually use in `LobbyBroadcastService`:
 * `to(room).emit(event, payload)`, `adapter.rooms`, and `sockets.get`. We
 * intentionally do NOT implement `of()` — this guards against regressing the
 * `this.server.of is not a function` bug where the wrong typing caused us to
 * call a `Server`-only method on a `Namespace`.
 */
function makeFakeNamespace(sockets: FakeSocket[]): {
  nsp: Namespace;
  toMock: jest.Mock;
  toEmit: jest.Mock;
} {
  const sockMap = new Map<string, FakeSocket>(sockets.map((s) => [s.id, s]));
  const rooms = new Map<string, Set<string>>();

  const toEmit = jest.fn();
  const toMock = jest.fn(() => ({ emit: toEmit }));

  const nsp = {
    to: toMock,
    adapter: { rooms },
    sockets: sockMap,
  } as unknown as Namespace;

  return { nsp, toMock, toEmit };
}

describe('LobbyBroadcastService', () => {
  describe('emit', () => {
    it('silently drops events before the namespace is attached', () => {
      const svc = new LobbyBroadcastService();
      expect(() => svc.emit('lobby-1', 'foo', { a: 1 })).not.toThrow();
    });

    it('forwards to the lobby room on the attached namespace', () => {
      const svc = new LobbyBroadcastService();
      const { nsp, toMock, toEmit } = makeFakeNamespace([]);
      svc.attachServer(nsp);

      svc.emit('lobby-1', 'lobby.match.statusChanged', { matchId: 'm' });

      expect(toMock).toHaveBeenCalledWith('lobby:lobby-1');
      expect(toEmit).toHaveBeenCalledWith('lobby.match.statusChanged', {
        matchId: 'm',
      });
    });
  });

  describe('emitToSteamIds', () => {
    it('does nothing before the namespace is attached', () => {
      const svc = new LobbyBroadcastService();
      expect(() =>
        svc.emitToSteamIds('lobby-1', ['765-A'], 'evt', {}),
      ).not.toThrow();
    });

    it('does nothing when the lobby room has no sockets', () => {
      const svc = new LobbyBroadcastService();
      const { nsp } = makeFakeNamespace([]);
      svc.attachServer(nsp);

      expect(() =>
        svc.emitToSteamIds('lobby-1', ['765-A'], 'evt', {}),
      ).not.toThrow();
    });

    it('only emits to sockets whose steam id is in the allow list', () => {
      const alice = makeSocket('sock-1', '765-A');
      const bob = makeSocket('sock-2', '765-B');
      const eve = makeSocket('sock-3', '765-E');
      const anon = makeSocket('sock-4'); // no steamId
      const svc = new LobbyBroadcastService();
      const { nsp } = makeFakeNamespace([alice, bob, eve, anon]);
      svc.attachServer(nsp);

      (nsp.adapter.rooms as Map<string, Set<string>>).set(
        'lobby:lobby-1',
        new Set(['sock-1', 'sock-2', 'sock-3', 'sock-4']),
      );

      const payload = { host: '10.0.0.1', port: 27015 };
      svc.emitToSteamIds('lobby-1', ['765-A', '765-B'], 'lobby.server.ready', payload);

      expect(alice.emit).toHaveBeenCalledWith('lobby.server.ready', payload);
      expect(bob.emit).toHaveBeenCalledWith('lobby.server.ready', payload);
      expect(eve.emit).not.toHaveBeenCalled();
      expect(anon.emit).not.toHaveBeenCalled();
    });

    it('skips socket ids that are no longer tracked by the namespace', () => {
      const alice = makeSocket('sock-1', '765-A');
      const svc = new LobbyBroadcastService();
      const { nsp } = makeFakeNamespace([alice]);
      svc.attachServer(nsp);

      (nsp.adapter.rooms as Map<string, Set<string>>).set(
        'lobby:lobby-1',
        new Set(['sock-1', 'ghost-sock']),
      );

      expect(() =>
        svc.emitToSteamIds('lobby-1', ['765-A'], 'lobby.server.ready', {}),
      ).not.toThrow();
      expect(alice.emit).toHaveBeenCalledTimes(1);
    });

    it('does NOT attempt to call .of() on the attached namespace (regression guard)', () => {
      // The original bug was that `LobbyBroadcastService` treated its
      // attached handle like a root `Server` and called `server.of('/veto')`.
      // Nest's `@WebSocketServer()` on a namespaced gateway actually injects
      // the `Namespace` itself, which has no `.of()` method. This assertion
      // intentionally attaches a namespace-shaped object with no `of` so any
      // future accidental reintroduction of `.of(...)` would throw here.
      const alice = makeSocket('sock-1', '765-A');
      const svc = new LobbyBroadcastService();
      const { nsp } = makeFakeNamespace([alice]);
      expect((nsp as unknown as { of?: unknown }).of).toBeUndefined();
      svc.attachServer(nsp);

      (nsp.adapter.rooms as Map<string, Set<string>>).set(
        'lobby:lobby-1',
        new Set(['sock-1']),
      );

      svc.emitToSteamIds('lobby-1', ['765-A'], 'lobby.server.ready', {});
      expect(alice.emit).toHaveBeenCalledWith('lobby.server.ready', {});
    });
  });
});
