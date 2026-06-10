import { IsBoolean } from 'class-validator';

export class ReadyDto {
  @IsBoolean()
  ready!: boolean;
}
