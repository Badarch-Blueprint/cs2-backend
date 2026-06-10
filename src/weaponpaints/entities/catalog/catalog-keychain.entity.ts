import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wp_catalog_keychains')
export class CatalogKeychain {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  defindex!: number;

  @Column({ nullable: true })
  rarity!: string;

  @Column({ nullable: true })
  image!: string;
}
