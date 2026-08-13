export type TaskCommandCapabilities = {
  write: boolean;
  manage: boolean;
  publish: boolean;
};

const COMMAND_ROLES = new Set(['admin', 'platform_operator']);

export function resolveTaskCommandCapabilities(
  roles: readonly string[],
  permissions: readonly string[]
): TaskCommandCapabilities {
  const hasCommandRole = roles.some((role) => COMMAND_ROLES.has(role));
  const granted = new Set(permissions);
  return {
    write: hasCommandRole && granted.has('tasks:write'),
    manage: hasCommandRole && granted.has('tasks:manage'),
    publish: hasCommandRole && granted.has('tasks:publish')
  };
}
