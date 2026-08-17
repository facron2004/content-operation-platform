import { optionalDateKey, optionalString } from '../content/dto-decorators';

export class OperationWorkbenchQueryDto {
  @optionalDateKey()
  date?: string;

  /** Cache bypass is restricted to elevated roles by hasForceSignal. */
  @optionalString(5)
  force?: string;
}
