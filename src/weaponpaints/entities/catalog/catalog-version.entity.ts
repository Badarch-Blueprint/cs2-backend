import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wp_catalog_version')
export class CatalogVersion {
  @PrimaryColumn()
  id!: string; // e.g. "latest"

  @Column({ type: 'timestamp' })
  updatedAt!: Date;
}
