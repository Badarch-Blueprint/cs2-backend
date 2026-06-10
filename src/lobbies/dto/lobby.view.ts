import type {
  LobbyFeatures,
  LobbyMemberRole,
  LobbyMode,
  LobbyRegion,
  LobbyStatus,
  LobbyTeam,
  RentalServerStatus,
} from '../lobby.types';

export interface LobbyMemberView {
  readonly userId: string;
  /** Steam64 id from the linked `users` row (null if user row missing). */
  readonly steamId: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly team: LobbyTeam;
  readonly role: LobbyMemberRole;
  readonly isReady: boolean;
  readonly joinedAt: string;
}

export interface RentalServerView {
  readonly id: string;
  readonly status: RentalServerStatus;
  readonly host: string | null;
  readonly port: number | null;
  readonly gotvPort: number | null;
  readonly connectString: string | null;
  readonly endsAt: string | null;
}

export interface LobbyView {
  readonly id: string;
  readonly inviteCode: string;
  readonly hostUserId: string;
  readonly status: LobbyStatus;
  readonly mode: LobbyMode;
  readonly name: string;
  readonly region: LobbyRegion;
  readonly features: LobbyFeatures;
  readonly teamSize: number;
  readonly members: readonly LobbyMemberView[];
  readonly expiresAt: string;
  readonly createdAt: string;
  /** Linked match row created on `start`; owns all veto/server/live state. */
  readonly match: { readonly id: string } | null;
  readonly server: RentalServerView | null;
}

export interface LobbyOptionsView {
  readonly regions: readonly { readonly value: LobbyRegion; readonly label: string; readonly available: boolean }[];
  readonly features: readonly { readonly key: keyof LobbyFeatures; readonly label: string; readonly available: boolean }[];
  readonly modes: readonly string[];
}
