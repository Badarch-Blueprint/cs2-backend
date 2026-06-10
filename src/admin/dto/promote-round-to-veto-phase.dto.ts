import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';

export class PromoteRoundToVetoPhaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(['A', 'B', 'C', 'D'], { each: true })
  zones!: ('A' | 'B' | 'C' | 'D')[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  round!: number;
}
