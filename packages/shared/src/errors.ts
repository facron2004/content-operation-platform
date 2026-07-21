/* 错误归一：不硬依赖 axios；web 可通过 isAxiosError 注入判别函数。 */
import { describeError, extractErrorMessage } from './error-message';
export type { ExtractErrorMessageOptions } from './error-message';
export { describeError, extractErrorMessage };
