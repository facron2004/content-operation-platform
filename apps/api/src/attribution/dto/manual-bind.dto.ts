import { IsString } from 'class-validator';

export class ManualBindDto {
  @IsString()
  taskId!: string;

  @IsString()
  orderId!: string;
}
