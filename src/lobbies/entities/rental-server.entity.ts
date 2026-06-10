import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { RentalServerStatus } from '../lobby.types';
import { Lobby } from './lobby.entity';

/**
 * Downstream artifact of a lobby once veto completes. 1:1 with a lobby.
 * Populated by the future CS2 provisioner; admins can PATCH connect info
 * during development.
 */
@Entity('rental_servers')
@Index(['status', 'createdAt'])
export class RentalServer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lobby_id', type: 'uuid', unique: true })
  lobbyId!: string;

  @OneToOne(() => Lobby, (l) => l.rentalServer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lobby_id' })
  lobby!: Lobby;

  @Column({ name: 'match_id', type: 'uuid', nullable: true })
  matchId!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'PROVISIONING' })
  status!: RentalServerStatus;

  @Column({ name: 'host', type: 'varchar', length: 128, nullable: true })
  host!: string | null;

  @Column({ name: 'port', type: 'int', nullable: true })
  port!: number | null;

  @Column({ name: 'gotv_port', type: 'int', nullable: true })
  gotvPort!: number | null;

  @Column({ name: 'connect_string', type: 'varchar', length: 256, nullable: true })
  connectString!: string | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ends_at', type: 'timestamp', nullable: true })
  endsAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
