import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type TournamentInquiryFormat =
  | 'single-elim'
  | 'double-elim'
  | 'swiss'
  | 'round-robin'
  | 'other';

@Entity('tournament_inquiries')
@Index(['receivedAt'])
export class TournamentInquiry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Nullable: inquiries might be submitted by anonymous-ish flows in the future. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'organization', type: 'varchar', length: 160, nullable: true })
  organization!: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 160 })
  contactEmail!: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 80 })
  contactName!: string;

  @Column({ name: 'bracket_size', type: 'int' })
  bracketSize!: number;

  @Column({ name: 'format', type: 'varchar', length: 16 })
  format!: TournamentInquiryFormat;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt!: Date;
}
