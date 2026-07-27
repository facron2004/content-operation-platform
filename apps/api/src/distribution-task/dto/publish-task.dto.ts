import { IsString, IsOptional, MaxLength } from 'class-validator';

export class PublishTaskDto {
  // operatorId/operatorName are stamped from JWT in the controller.
  // evidenceUrl validated as http(s) in controller via isHttpUrl.

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
