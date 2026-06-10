import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { LobbyMemberRole, LobbyTeam } from '../lobby.types';
import { Lobby } from './lobby.entity';

/**
 * Active or historical membership in a lobby. `leftAt` is null while the user
 * is in the lobby; we keep the row after leave/kick for auditability. The
 * service layer enforces at-most-one active membership per user via the same
 * rule expressed in the partial unique index below (Postgres only).
 */
@Entity('lobby_members')
@Index(['lobbyId'])
@Index('lobby_members_active_uid_uq', ['lobbyId', 'userId'], {
  unique: true,
  where: 'left_at IS NULL',
})
export class LobbyMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lobby_id', type: 'uuid' })
  lobbyId!: string;

  @ManyToOne(() => Lobby, (l) => l.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lobby_id' })
  lobby!: Lobby;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'team', type: 'varchar', length: 10 })
  team!: LobbyTeam;

  @Column({ name: 'role', type: 'varchar', length: 10 })
  role!: LobbyMemberRole;

  @Column({ name: 'is_ready', type: 'boolean', default: false })
  isReady!: boolean;

  @Column({ name: 'joined_at', type: 'timestamp' })
  joinedAt!: Date;

  @Column({ name: 'left_at', type: 'timestamp', nullable: true })
  leftAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
