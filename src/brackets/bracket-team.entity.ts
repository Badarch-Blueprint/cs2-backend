import type { BracketGroupCode } from './bracket.constants';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Team } from '../teams/team.entity';

@Entity('bracket_teams')
@Unique(['groupCode', 'slotIndex'])
@Index(['groupCode'])
export class BracketTeam {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'group_code', type: 'varchar', length: 1 })
  groupCode!: BracketGroupCode;

  @Column({ name: 'slot_index', type: 'int' })
  slotIndex!: number;

  @ManyToOne(() => Team, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'team_id' })
  team!: Team;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
