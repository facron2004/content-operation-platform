import { SetMetadata } from '@nestjs/common';

export const AUTH_DECLARATION_KEY = 'auth-declaration';

/** Explicitly documents that a route requires an authenticated session. */
export const RequireLogin = () => SetMetadata(AUTH_DECLARATION_KEY, 'authenticated');
