import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Mirrors `wp_player_agents`. Stores the chosen agent model per team (one row
 * per player). `agent_ct` and `agent_t` hold the agent "model path" strings
 * (e.g. "characters/models/professional/ctm_professional_varianta.vmdl").
 */
@Entity('wp_player_agents', { synchronize: false })
export class PlayerAgent {
  @PrimaryColumn({ name: 'steamid', type: 'varchar', length: 18 })
  steamid!: string;

  @Column({ name: 'agent_ct', type: 'varchar', length: 64, nullable: true })
  agentCt!: string | null;

  @Column({ name: 'agent_t', type: 'varchar', length: 64, nullable: true })
  agentT!: string | null;
}
