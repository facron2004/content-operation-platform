import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { OutboxService, type OutboxEventContext } from './outbox.service';

@Injectable()
export class TaskPublishedOutboxHandler implements OnModuleInit {
  constructor(
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService
  ) {}

  onModuleInit(): void {
    this.outbox.registerHandler('task.published', (event) => this.handle(event));
  }

  private async handle(event: OutboxEventContext): Promise<void> {
    const taskId = event.payload.taskId;
    if (typeof taskId !== 'string' || taskId !== event.aggregateId) {
      throw new Error(
        `task.published payload taskId does not match aggregate ${event.aggregateId}`
      );
    }

    await this.auditLog.log({
      action: 'outbox.task.published',
      objectType: 'DistributionTask',
      objectId: taskId,
      result: 'processed',
      after: JSON.stringify({
        eventId: event.id,
        operatorId: event.payload.operatorId ?? null,
        operatorName: event.payload.operatorName ?? null
      })
    });
  }
}
