import { IsString, IsOptional, MaxLength, IsDateString } from 'class-validator';

export class CancelTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReassignTaskDto {
  @IsString()
  @MaxLength(64)
  assigneeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assigneeName?: string;
}

/** Promote draft/waiting_audit/blocked → scheduled (requires plannedAt). */
export class ScheduleTaskDto {
  @IsDateString()
  plannedAt!: string;
}
