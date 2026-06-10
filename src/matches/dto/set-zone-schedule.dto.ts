import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ZoneRoundPairDto {
  @IsUUID('4')
  teamAId!: string;

  @IsUUID('4')
  teamBId!: string;
}

export class ZoneRoundScheduleDto {
  @IsInt()
  @Min(1)
  roundNumber!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ZoneRoundPairDto)
  pairings!: ZoneRoundPairDto[];

  @IsOptional()
  @IsUUID('4')
  byeTeamId?: string | null;
}

export class SetZoneScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ZoneRoundScheduleDto)
  rounds!: ZoneRoundScheduleDto[];
}
