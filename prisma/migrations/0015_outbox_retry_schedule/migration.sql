-- Persist the next retry window so multiple API processes observe the same
-- Outbox backoff instead of retrying every event on every scheduler tick.
ALTER TABLE "OutboxEvent" ADD COLUMN "nextRetryAt" DATETIME;

DROP INDEX "OutboxEvent_status_createdAt_idx";

CREATE INDEX "OutboxEvent_status_nextRetryAt_createdAt_idx"
ON "OutboxEvent"("status", "nextRetryAt", "createdAt");
