import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describeError, exponentialBackoff } from '@content/shared';
import { msToISO } from '../common/format';
import { MS_PER_MINUTE } from '../domain/utils';
import {
  loginToJeesite,
  maskCookie,
  maskIdentifier,
  validateJeesiteCookie,
  type LoginResult
} from './auto-login-client';

const CACHED_COOKIE_TTL_MS = 2 * 60 * MS_PER_MINUTE;
const COOLDOWN_BASE_MS = 5 * MS_PER_MINUTE;
const COOLDOWN_MAX_MS = 30 * MS_PER_MINUTE;

const computeCooldownMs = (failedAttempts: number): number =>
  exponentialBackoff(failedAttempts - 3, COOLDOWN_BASE_MS, COOLDOWN_MAX_MS);

/** How long a cookie validation result stays fresh (SPA polls every 30s). */
const COOKIE_STATUS_CACHE_MS = 60_000;

@Injectable()
export class AutoLoginService implements OnModuleInit {
  private readonly logger = new Logger(AutoLoginService.name);
  private cachedCookie: string | null = null;
  private lastLoginTime = 0;
  private loginInProgress: Promise<LoginResult> | null = null;
  private failedAttempts = 0;
  private lastFailedTime = 0;
  /** Cache last validateCookie result so status polling does not thrash EXTERNAL_API. */
  private lastValidateAt = 0;
  private lastValidateCookie: string | null = null;
  private lastValidateResult = false;
  /** Coalesce concurrent validateCookie calls for the same cookie (residual #84). */
  private validateInFlight: Promise<boolean> | null = null;
  private validateInFlightCookie: string | null = null;

  async onModuleInit() {
    await this.loadCookieFromCacheFile();
    if (!this.cachedCookie) await this.refreshExpiredCookie('startup');
  }

  private async loadCookieFromCacheFile() {
    try {
      const cachePath = path.resolve(process.cwd(), '.cookie.cache');
      const exists = await fs
        .access(cachePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) return;

      const cookie = (await fs.readFile(cachePath, 'utf8')).trim();
      if (!cookie) return;
      if (!(await this.validateCookie(cookie))) {
        this.logger.warn('Cached cookie from .cookie.cache is invalid or expired');
        return;
      }

      this.cachedCookie = cookie;
      this.lastLoginTime = Date.now();
      this.failedAttempts = 0;
      this.logger.log('Loaded and validated cached cookie from .cookie.cache');
    } catch (error: unknown) {
      this.logger.error(`Failed to load cookie from cache file: ${describeError(error)}`);
    }
  }

  private async saveCookieToCacheFile(cookie: string) {
    try {
      const cachePath = path.resolve(process.cwd(), '.cookie.cache');
      await fs.writeFile(cachePath, cookie, { encoding: 'utf8', mode: 0o600 });
      this.logger.log('Saved valid cookie to .cookie.cache');
    } catch (error: unknown) {
      this.logger.error(`Failed to save cookie to cache file: ${describeError(error)}`);
    }
  }

  async ensureValidCookie(forceRefresh = false): Promise<string | null> {
    const now = Date.now();
    const cooldownCookie = this.resolveCooldownCookie(now);
    if (cooldownCookie !== undefined) return cooldownCookie;

    if (forceRefresh) {
      this.logger.log('Force refresh requested, performing auto login');
      return this.performLogin();
    }

    const cachedCookie = this.getFreshCachedCookie(now);
    if (cachedCookie) return cachedCookie;

    const environmentCookie = this.getEnvironmentCookie();
    if (environmentCookie) {
      if (await this.validateCookie(environmentCookie)) {
        this.cachedCookie = environmentCookie;
        this.lastLoginTime = Date.now();
        this.failedAttempts = 0;
        await this.saveCookieToCacheFile(environmentCookie);
        return environmentCookie;
      }
      this.logger.warn('Environment cookie is invalid or expired, performing auto login');
    } else {
      this.logger.log('No valid cached cookie, performing auto login');
    }
    return this.performLogin();
  }

  private refreshExpiredCookie(reason: string): Promise<string | null> {
    this.logger.log(`Refreshing JeeSite cookie automatically (${reason})`);
    return this.performLogin();
  }

  private resolveCooldownCookie(now: number): string | null | undefined {
    if (this.failedAttempts < 3) return undefined;

    const waitTime = computeCooldownMs(this.failedAttempts);
    const timeSinceLastFail = now - this.lastFailedTime;
    if (timeSinceLastFail >= waitTime) {
      this.logger.log('Cooldown period expired, resetting failed attempts counter');
      this.failedAttempts = 0;
      return undefined;
    }

    const remainingMinutes = Math.ceil((waitTime - timeSinceLastFail) / MS_PER_MINUTE);
    this.logger.warn(
      `Too many failed login attempts (${this.failedAttempts}). Please wait ${remainingMinutes} more minutes or login manually.`
    );
    return this.getEnvironmentCookie();
  }

  private getFreshCachedCookie(now: number): string | null {
    if (this.cachedCookie && now - this.lastLoginTime < CACHED_COOKIE_TTL_MS) {
      this.logger.debug('Using cached cookie');
      return this.cachedCookie;
    }
    this.cachedCookie = null;
    return null;
  }

  private getEnvironmentCookie(): string | null {
    if (process.env.EXTERNAL_API_COOKIE && !this.cachedCookie) {
      this.logger.debug('Using cookie from environment variable');
      return process.env.EXTERNAL_API_COOKIE;
    }
    return null;
  }

  private async performLogin(): Promise<string | null> {
    if (this.loginInProgress) {
      this.logger.debug('Login in progress, waiting...');
      const result = await this.loginInProgress;
      return result.success ? (result.cookie ?? null) : null;
    }

    this.loginInProgress = this.doLogin();
    try {
      const result = await this.loginInProgress;
      if (!result.success || !result.cookie) {
        this.failedAttempts += 1;
        this.lastFailedTime = Date.now();
        this.logger.error(`Auto login failed (attempt ${this.failedAttempts}): ${result.error}`);
        return null;
      }

      this.cachedCookie = result.cookie;
      this.lastLoginTime = Date.now();
      this.failedAttempts = 0;
      this.lastValidateCookie = result.cookie;
      this.lastValidateResult = true;
      this.lastValidateAt = Date.now();
      this.logger.log(`Auto login successful, new cookie: ${maskCookie(result.cookie)}`);
      await this.saveCookieToCacheFile(result.cookie);
      return result.cookie;
    } finally {
      this.loginInProgress = null;
    }
  }

  private doLogin(): Promise<LoginResult> {
    return loginToJeesite({
      username: process.env.EXTERNAL_API_USERNAME,
      password: process.env.EXTERNAL_API_PASSWORD,
      baseUrl: process.env.EXTERNAL_API_BASE_URL,
      logger: this.logger
    });
  }

  /**
   * Validate a cookie against EXTERNAL_API with TTL cache + in-flight coalesce.
   * Concurrent SPA polls / ensureValidCookie cold hits share one outbound check.
   */
  private validateCookie(cookie: string): Promise<boolean> {
    const now = Date.now();
    if (cookie === this.lastValidateCookie && now - this.lastValidateAt < COOKIE_STATUS_CACHE_MS) {
      return Promise.resolve(this.lastValidateResult);
    }
    if (this.validateInFlight && this.validateInFlightCookie === cookie) {
      return this.validateInFlight;
    }

    const flight = validateJeesiteCookie(cookie, process.env.EXTERNAL_API_BASE_URL)
      .then((result) => {
        this.lastValidateCookie = cookie;
        this.lastValidateResult = result;
        this.lastValidateAt = Date.now();
        return result;
      })
      .finally(() => {
        if (this.validateInFlightCookie === cookie) {
          this.validateInFlight = null;
          this.validateInFlightCookie = null;
        }
      });
    this.validateInFlight = flight;
    this.validateInFlightCookie = cookie;
    return flight;
  }

  clearCache(): void {
    this.cachedCookie = null;
    this.lastLoginTime = 0;
  }

  /**
   * Read-only cookie status. Never triggers JeeSite re-login — that side effect
   * let any authenticated poller thrash external credentials. Use ensureValidCookie
   * / updateManualCookie / dedicated refresh paths for renewal.
   */
  async getCookieStatus() {
    const now = Date.now();
    const cookieToTest = this.cachedCookie || process.env.EXTERNAL_API_COOKIE || null;
    // validateCookie owns TTL + in-flight coalesce (shared with ensureValidCookie).
    const isValid = cookieToTest ? await this.validateCookie(cookieToTest) : false;

    const cooldownMinutes =
      this.failedAttempts >= 3
        ? Math.max(
            0,
            Math.ceil(
              (computeCooldownMs(this.failedAttempts) - (now - this.lastFailedTime)) / MS_PER_MINUTE
            )
          )
        : 0;

    // Do not return maskedCookie — cookie *names* (session id keys) are recon
    // even when values are redacted. hasCookie + isValid is enough for SPA status.
    // failedAttempts is also omitted: SPA only needs cooldownMinutes; exposing
    // the raw counter aids recon of lockout thresholds.
    return {
      hasCookie: !!cookieToTest,
      isValid,
      autoRefreshed: false,
      username: process.env.EXTERNAL_API_USERNAME
        ? maskIdentifier(process.env.EXTERNAL_API_USERNAME)
        : null,
      cooldownMinutes,
      lastLoginTime: msToISO(this.lastLoginTime)
    };
  }

  async updateManualCookie(cookie: string): Promise<{ success: boolean; error?: string }> {
    const trimmedCookie = cookie.trim();
    if (!trimmedCookie) return { success: false, error: 'Cookie 内容不能为空' };
    if (!(await this.validateCookie(trimmedCookie))) {
      this.lastValidateCookie = trimmedCookie;
      this.lastValidateResult = false;
      this.lastValidateAt = Date.now();
      return {
        success: false,
        error: 'Cookie 校验失败，该 Cookie 可能已失效，请重新从浏览器获取。'
      };
    }

    this.cachedCookie = trimmedCookie;
    this.lastLoginTime = Date.now();
    this.failedAttempts = 0;
    this.lastValidateCookie = trimmedCookie;
    this.lastValidateResult = true;
    this.lastValidateAt = Date.now();
    await this.saveCookieToCacheFile(trimmedCookie);
    this.logger.log('Manual cookie update validated and saved');
    return { success: true };
  }
}
