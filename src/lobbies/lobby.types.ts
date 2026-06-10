/**
 * Shared constants and string-literal union types for the Lobby / Rental Server
 * module. Kept separate from entity files so DTOs and views can import them
 * without pulling TypeORM decorators into the test bundle.
 */

export const LOBBY_MODES = ['BO3', 'BO5', 'TOURNAMENT'] as const;
export type LobbyMode = 'BO3' | 'BO5';
export type LobbyModeAny = (typeof LOBBY_MODES)[number];

export const LOBBY_REGIONS = ['MN'] as const;
export type LobbyRegion = (typeof LOBBY_REGIONS)[number];

/**
 * Lifecycle of a lobby row. Once a host calls `start` and all players are
 * ready the lobby creates a `matches` row (with `match.lobby_id` set) and
 * flips to `STARTED`. From that point the linked match owns the entire veto
 * → configuring → live → finished flow; the lobby just keeps a pointer to the
 * match and may still transition to `CANCELLED`/`EXPIRED` on cleanup.
 */
export const LOBBY_STATUSES = [
  'WAITING',
  'READY_CHECK',
  'STARTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type LobbyStatus = (typeof LOBBY_STATUSES)[number];

export const TERMINAL_LOBBY_STATUSES: readonly LobbyStatus[] = [
  'CANCELLED',
  'EXPIRED',
];

export const ACTIVE_LOBBY_STATUSES: readonly LobbyStatus[] = [
  'WAITING',
  'READY_CHECK',
  'STARTED',
];

export type LobbyTeam = 'A' | 'B' | 'SPECTATOR';
export type PlayingTeam = Exclude<LobbyTeam, 'SPECTATOR'>;

export type LobbyMemberRole = 'HOST' | 'CAPTAIN' | 'MEMBER';

export type RentalServerStatus =
  | 'PROVISIONING'
  | 'READY'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'FAILED'
  | 'RELEASED';

export interface LobbyFeatures {
  readonly cstv: boolean;
  readonly demo: boolean;
  readonly skinChanger: boolean;
  readonly highLight: boolean;
}

export const DEFAULT_LOBBY_FEATURES: LobbyFeatures = {
  cstv: false,
  demo: false,
  skinChanger: false,
  highLight: false,
};

export const LOBBY_TEAM_SIZE = 5;

export const LOBBY_INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const LOBBY_INVITE_CODE_LENGTH = 6;
