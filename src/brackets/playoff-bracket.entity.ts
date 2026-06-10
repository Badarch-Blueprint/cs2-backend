import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One row per filled playoff slot (empty slots are not stored).
 * Logical grid: {@link PLAYOFF_MATCH_COUNT} matches × 2 teams each, addressed by match_number (1–7) and slot_index (0–1).
 */
@Entity('playoff_brackets')
@Unique(['matchNumber', 'slotIndex'])
@Index(['matchNumber'])
export class PlayoffBracket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'match_number', type: 'int' })
  matchNumber!: number;

  @Column({ name: 'slot_index', type: 'int' })
  slotIndex!: number;

  @Column({ name: 'team_name', type: 'varchar', length: 255 })
  teamName!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
