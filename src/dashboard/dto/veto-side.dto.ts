import { IsIn, IsString } from 'class-validator';

export class VetoSideDto {
  @IsString()
  @IsIn(['ct', 't'], { message: 'side must be either "ct" or "t"' })
  side!: 'ct' | 't';
}
