import { IsUUID } from 'class-validator';

export class UpdateBracketTeamDto {
  @IsUUID('4')
  teamId!: string;
}
