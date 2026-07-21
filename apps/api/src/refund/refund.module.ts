/** Consolidated refund module. */
import { Module } from '@nestjs/common';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';

// --- refund.module.ts ---
@Module({ controllers: [RefundController], providers: [RefundService], exports: [RefundService] })
export class RefundModule {}
