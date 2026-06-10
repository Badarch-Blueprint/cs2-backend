import type { User } from '../users/user.entity';
import type {
  LobbyMemberView,
  LobbyView,
  RentalServerView,
} from './dto/lobby.view';
import { Lobby } from './entities/lobby.entity';
import { LobbyMember } from './entities/lobby-member.entity';
import { RentalServer } from './entities/rental-server.entity';
import { DEFAULT_LOBBY_FEATURES } from './lobby.types';

type ViewInputs = {
  readonly lobby: Lobby;
  readonly members: readonly LobbyMember[];
  readonly users: ReadonlyMap<string, User>;
  readonly rentalServer: RentalServer | null;
  /** When false, sensitive server fields (host/port/connectString) are stripped. */
  readonly includeServerSecrets: boolean;
};

function mapMember(member: LobbyMember, user: User | undefined): LobbyMemberView {
  return {
    userId: member.userId,
    steamId: user?.steamId ?? null,
    displayName: user?.displayName ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    team: member.team,
    role: member.role,
    isReady: member.isReady,
    joinedAt: member.joinedAt.toISOString(),
  };
}

function buildServerView(
  rental: RentalServer | null,
  includeServerSecrets: boolean,
): RentalServerView | null {
  if (!rental) {
    return null;
  }
  return {
    id: rental.id,
    status: rental.status,
    host: includeServerSecrets ? rental.host : null,
    port: includeServerSecrets ? rental.port : null,
    gotvPort: includeServerSecrets ? rental.gotvPort : null,
    connectString: includeServerSecrets ? rental.connectString : null,
    endsAt: rental.endsAt ? rental.endsAt.toISOString() : null,
  };
}

export function buildLobbyView(input: ViewInputs): LobbyView {
  const { lobby, members, users, rentalServer, includeServerSecrets } = input;
  const activeMembers = members.filter((m) => !m.leftAt);
  const memberViews = activeMembers.map((m) =>
    mapMember(m, users.get(m.userId)),
  );

  return {
    id: lobby.id,
    inviteCode: lobby.inviteCode,
    hostUserId: lobby.hostUserId,
    status: lobby.status,
    mode: lobby.mode,
    name: lobby.name,
    region: lobby.region,
    features: lobby.features ?? DEFAULT_LOBBY_FEATURES,
    teamSize: lobby.teamSize,
    members: memberViews,
    expiresAt: lobby.expiresAt.toISOString(),
    createdAt: lobby.createdAt.toISOString(),
    match: lobby.matchId ? { id: lobby.matchId } : null,
    server: buildServerView(rentalServer, includeServerSecrets),
  };
}
