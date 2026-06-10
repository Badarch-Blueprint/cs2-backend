import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type {
  LobbyFeatures,
  LobbyMode,
  LobbyRegion,
  LobbyStatus,
} from '../lobby.types';
import { LobbyMember } from './lobby-member.entity';
import { RentalServer } from './rental-server.entity';

/**
 * A rental lobby (Bo3/Bo5) created from the portal rent form. Pure
 * team-builder: WAITING → READY_CHECK → STARTED. On `STARTED` a {@link Match}
 * row is created with `match.lobby_id = lobby.id` and from then on the match
 * row owns all veto / server / live state (see {@link Match.vetoBans} etc.).
 * The lobby only keeps a pointer to its match and may transition to
 * `CANCELLED`/`EXPIRED` via cleanup paths.
 */
@Entity('lobbies')
@Index(['status', 'createdAt'])
export class Lobby {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'invite_code', type: 'varchar', length: 10, unique: true })
  inviteCode!: string;

  @Column({ name: 'host_user_id', type: 'uuid' })
  hostUserId!: string;

  @Column({ name: 'mode', type: 'varchar', length: 8 })
  mode!: LobbyMode;

  @Column({ name: 'name', type: 'varchar', length: 64 })
  name!: string;

  @Column({ name: 'region', type: 'varchar', length: 8 })
  region!: LobbyRegion;

  @Column({ name: 'server_password', type: 'varchar', length: 32, nullable: true })
  serverPassword!: string | null;

  @Column({ name: 'features', type: 'jsonb' })
  features!: LobbyFeatures;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'WAITING' })
  status!: LobbyStatus;

  @Column({ name: 'team_size', type: 'int', default: 5 })
  teamSize!: number;

  /**
   * Once the host calls `start` and both teams are ready, a matches row is
   * created (status=VETO_PHASE, lobby_id=this.id) and `matchId` is set. From
   * then on all veto + series state lives on the match (see {@link Match}).
   */
  @Column({ name: 'match_id', type: 'uuid', nullable: true })
  matchId!: string | null;

  @Column({ name: 'rental_server_id', type: 'uuid', nullable: true })
  rentalServerId!: string | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => LobbyMember, (m) => m.lobby, { cascade: true })
  members!: LobbyMember[];

  @OneToOne(() => RentalServer, (s) => s.lobby, { nullable: true })
  @JoinColumn({ name: 'rental_server_id' })
  rentalServer!: RentalServer | null;

  /**
   * Customised JSON representation so accidental `logger.log(lobby)` /
   * `JSON.stringify(lobby)` never leaks the server password. The HTTP API
   * serialises via {@link LobbyView} and never touches this row directly.
   */
  toJSON(): Record<string, unknown> {
    const { serverPassword: _pwd, ...rest } = this;
    return { ...rest, serverPassword: _pwd ? '[REDACTED]' : null };
  }
}
