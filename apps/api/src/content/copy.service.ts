import { Inject, Injectable } from '@nestjs/common';
import type { AuditCopyRequest, GeneratedCopy, GenerateCopyRequest } from '@content/shared';
import { CopyAuditService } from './copy-audit.service';
import { CopyGenerationService } from './copy-generation.service';
import { CopyQueryService, type CopyListFilters } from './copy-query.service';

/**
 * Compatibility facade for copy controllers and existing callers.
 * Generation, querying, and audit/task mutation have independent ownership so
 * each path can evolve without recreating the former all-in-one service.
 */
@Injectable()
export class CopyService {
  constructor(
    @Inject(CopyGenerationService)
    private readonly generationService: CopyGenerationService,
    @Inject(CopyQueryService) private readonly queryService: CopyQueryService,
    @Inject(CopyAuditService) private readonly auditService: CopyAuditService
  ) {}

  generateCopies(request: GenerateCopyRequest) {
    return this.generationService.generateCopies(request);
  }

  listCopies(filters: CopyListFilters, page?: number, pageSize?: number) {
    return this.queryService.listCopies(filters, page, pageSize);
  }

  getCopy(contentId: string) {
    return this.queryService.getCopy(contentId);
  }

  auditCopy(
    contentId: string,
    request: AuditCopyRequest & { mintDistributionTask?: boolean },
    preloaded?: GeneratedCopy
  ) {
    return this.auditService.auditCopy(contentId, request, preloaded);
  }
}
