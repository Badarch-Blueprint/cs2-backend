import { IsArray, IsString } from 'class-validator';

/**
 * Fixed length per group (5 or 6). Each entry is a team UUID, or an empty string for an empty slot.
 */
export class ReplaceGroupRosterDto {
  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];
}
