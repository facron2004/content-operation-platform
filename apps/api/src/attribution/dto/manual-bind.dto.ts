import { IsString, MaxLength } from 'class-validator';

export class ManualBindDto {
  @IsString()
  @MaxLength(64)
  taskId!: string;

  @IsString()
  @MaxLength(64)
  orderId!: string;
}
