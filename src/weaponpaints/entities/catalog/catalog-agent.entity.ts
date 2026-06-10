import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wp_catalog_agents')
export class CatalogAgent {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  defindex!: number;

  @Column({ nullable: true })
  team!: string; // T, CT, Any

  @Column({ nullable: true })
  rarity!: string;

  @Column({ nullable: true })
  image!: string;
}
