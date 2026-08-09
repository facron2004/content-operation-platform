/**
 * Compatibility barrel for the user-access application services.
 *
 * Keep the historical import path stable while authentication, commands,
 * queries, and role-scope policy live in focused modules.
 */
export { UserAuthService } from './user-auth.service';
export { UserCommandService } from './user-command.service';
export { UserQueryService } from './user-query.service';
export type { RoleBindingInput, UserCommandOptions } from './user-role-policy';
