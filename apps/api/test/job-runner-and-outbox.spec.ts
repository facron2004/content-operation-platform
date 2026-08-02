import { describe, it, expect, vi } from 'vitest';
import { JobRunnerService } from '../src/jobs/job-runner.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('JobRunner and Outbox Services Unit Tests', () => {
  it('JobRunnerService catches errors and updates JobRun with failed status', async () => {
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn()
    } as unknown as PrismaService;

    const runner = new JobRunnerService(mockPrisma);

    await runner.runJob('failing-job', async () => {
      throw new Error('Database connection failed');
    });

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "JobRun"'),
      expect.any(String),
      expect.any(Number),
      'Database connection failed',
      null,
      expect.any(String)
    );
  });

  it('OutboxService constructs correctly formatted pending events', async () => {
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1)
    } as unknown as PrismaService;

    const outbox = new OutboxService(mockPrisma);
    const eventId = await outbox.publishEvent(mockPrisma, 'Task', 'task-100', 'Published', {
      by: 'user-1'
    });

    expect(eventId).toMatch(/^evt_/);
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "OutboxEvent"'),
      eventId,
      'Task',
      'task-100',
      'Published',
      JSON.stringify({ by: 'user-1' })
    );
  });
});
