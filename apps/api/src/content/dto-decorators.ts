import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

/** Default max when callers omit length — prevents unbounded free-form strings. */
const DEFAULT_MAX = 200;

/** Strict business-day key (YYYY-MM-DD). Prefer over free-form MaxLength(40). */
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const DATE_KEY_MSG = '必须为 YYYY-MM-DD 格式';

/**
 * Required non-empty string. IsNotEmpty is mandatory: class-validator skips
 * IsString/MinLength when the property is missing, which would let required
 * fields silently fall through to handlers (404/500 instead of 400).
 */
export const requiredString = (maxLength: number = DEFAULT_MAX) =>
  applyDecorators(IsNotEmpty(), IsString(), MinLength(1), MaxLength(maxLength));

export const optionalString = (maxLength: number = DEFAULT_MAX, options?: ValidationOptions) =>
  applyDecorators(IsOptional(options), IsString(), MaxLength(maxLength));

/** Required YYYY-MM-DD business date key. */
export const requiredDateKey = () =>
  applyDecorators(IsString(), Matches(YYYY_MM_DD, { message: DATE_KEY_MSG }));

/** Optional YYYY-MM-DD business date key. */
export const optionalDateKey = (options?: ValidationOptions) =>
  applyDecorators(IsOptional(options), IsString(), Matches(YYYY_MM_DD, { message: DATE_KEY_MSG }));

/**
 * Optional ISO-8601 datetime (or date) for fields stored as timestamps.
 * Accepts `2026-07-16T12:00:00.000Z` / `2026-07-16T12:00:00+08:00` / `2026-07-16`.
 * Rejects free-form labels like "tomorrow".
 */
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const ISO_DATE_TIME_MSG = '必须为 ISO-8601 日期或时间戳';

export const optionalIsoDateTime = (options?: ValidationOptions) =>
  applyDecorators(
    IsOptional(options),
    IsString(),
    MaxLength(40),
    Matches(ISO_DATE_TIME, { message: ISO_DATE_TIME_MSG })
  );
