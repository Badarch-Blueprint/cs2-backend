import { IsIn, IsString } from 'class-validator';

import { CS2_COMP_MAP_POOL } from '../../matches/cs2-map-pool';

const MAP_NAMES = [...CS2_COMP_MAP_POOL] as unknown as string[];

export class VetoBanDto {
  @IsString()
  @IsIn(MAP_NAMES, {
    message: `mapName must be one of: ${CS2_COMP_MAP_POOL.join(', ')}`,
  })
  mapName!: string;
}
