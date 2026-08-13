import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTaskCommandCapabilities } from './task-command-permissions';

const webSrc = path.resolve(__dirname, '../..');

describe('task command permissions', () => {
  it('requires both a command role and the endpoint permission', () => {
    expect(
      resolveTaskCommandCapabilities(['auditor'], ['tasks:write', 'tasks:manage', 'tasks:publish'])
    ).toEqual({ write: false, manage: false, publish: false });
    expect(resolveTaskCommandCapabilities(['platform_operator'], ['tasks:read'])).toEqual({
      write: false,
      manage: false,
      publish: false
    });
    expect(
      resolveTaskCommandCapabilities(['platform_operator'], ['tasks:write', 'tasks:publish'])
    ).toEqual({ write: true, manage: false, publish: true });
  });

  it('wires capabilities into both the task list and detail actions', async () => {
    const [center, table, detail] = await Promise.all([
      readFile(path.join(webSrc, 'views/TaskCenterView.vue'), 'utf8'),
      readFile(path.join(webSrc, 'features/task-center/components/TaskListTable.vue'), 'utf8'),
      readFile(path.join(webSrc, 'views/TaskDetailView.vue'), 'utf8')
    ]);

    expect(center).toContain(':allow-write="taskCapabilities.write"');
    expect(center).toContain(':allow-manage="taskCapabilities.manage"');
    expect(center).toContain(':allow-publish="taskCapabilities.publish"');
    expect(table).toContain('return props.allowWrite && EDITABLE.includes(task.status)');
    expect(table).toContain('return props.allowManage && SCHEDULABLE.includes(task.status)');
    expect(table).toContain('return props.allowPublish && PUBLISHABLE.includes(task.status)');
    expect(detail).toContain('taskCapabilities.value.manage');
    expect(detail).toContain('taskCapabilities.value.publish');
  });
});
