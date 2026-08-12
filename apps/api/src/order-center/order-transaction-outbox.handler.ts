import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OutboxService, type OutboxEventContext } from '../outbox/outbox.service';

const ORDER_TRANSACTION_EVENTS = [
  'order.verified',
  'refund.requested',
  'refund.approved',
  'refund.completed',
  'refund.rejected'
] as const;

/**
 * Registers the transaction events so the existing outbox processor can
 * acknowledge them. Settlement/provider integrations consume these events in
 * a later capability slice; no external payment call is faked here.
 */
@Injectable()
export class OrderTransactionOutboxHandler implements OnModuleInit {
  private readonly logger = new Logger(OrderTransactionOutboxHandler.name);

  constructor(@Inject(OutboxService) private readonly outbox: OutboxService) {}

  onModuleInit(): void {
    for (const eventType of ORDER_TRANSACTION_EVENTS) {
      this.outbox.registerHandler(eventType, (event) => this.handle(event));
    }
  }

  private handle(event: OutboxEventContext): void {
    this.logger.debug(
      `Acknowledged ${event.eventType} for ${event.aggregateType}/${event.aggregateId}; downstream settlement/provider is not connected`
    );
  }
}
