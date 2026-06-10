import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

import { PLAYOFF_TOTAL_SLOTS } from '../playoff.constants';

/**
 * Row-major roster: match 1 slot 0, match 1 slot 1, … match 7 slot 1.
 * Use an empty string for a TBD slot (clears any stored row for that cell).
 */
export class ReplacePlayoffsDto {
  @IsArray()
  @ArrayMinSize(PLAYOFF_TOTAL_SLOTS)
  @ArrayMaxSize(PLAYOFF_TOTAL_SLOTS)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  roster!: string[];
}
