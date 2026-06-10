import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wp_catalog_music')
export class CatalogMusic {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  defindex!: number;

  @Column({ nullable: true })
  image!: string;
}
