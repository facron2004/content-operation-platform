import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { applyMoneyView } from '@content/shared';

/**
 * VNext 金额精度治理（PRD §7.4.4 / 阶段五：切换读取）。
 *
 * 全局响应拦截器：把响应体中所有金额实体的 *Fen（BigInt 分）序列化为字符串，
 * 并追加 <floatField>Display（"39.90"）。原 Float 字段保留，迁移期新旧并存。
 *
 * 注册顺序：紧接 BigIntSerializerInterceptor 之后。因 Nest 响应管道按注册逆序执行，
 * 本拦截器会在 BigInt→Number 转换之前先处理 Fen，确保 *Fen 以字符串（而非 number）
 * 形式对外传输，符合 §7.4.4「接口层使用字符串传输」的要求。
 *
 * 纯「只读增强」，不改变既有字段结构与取值，对现有调用方向后兼容。
 */
@Injectable()
export class MoneyViewInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => applyMoneyView(value)));
  }
}
