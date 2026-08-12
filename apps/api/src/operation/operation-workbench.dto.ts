import { optionalDateKey } from '../content/dto-decorators';

export class OperationWorkbenchQueryDto {
  @optionalDateKey()
  date?: string;
}
