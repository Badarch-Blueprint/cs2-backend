import { IsBoolean } from 'class-validator';

export class LobbyFeaturesDto {
  @IsBoolean()
  cstv!: boolean;

  @IsBoolean()
  demo!: boolean;

  @IsBoolean()
  skinChanger!: boolean;

  @IsBoolean()
  highLight!: boolean;
}
