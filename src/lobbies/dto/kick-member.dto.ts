import { IsUUID } from 'class-validator';

export class KickMemberDto {
  @IsUUID()
  userId!: string;
}
