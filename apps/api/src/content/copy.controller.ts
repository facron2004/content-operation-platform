import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { AuditStatus, Channel } from '@content/shared';
import { CopyService } from './copy.service';
import { GenerateCopyDto, AuditCopyDto } from './content.dto';

@ApiTags('copy')
@Controller('api/content')
export class CopyController {
  constructor(@Inject(CopyService) private readonly copyService: CopyService) {}

  @Post('generate')
  @ApiOperation({
    summary: '生成文稿',
    description: 'AI 或规则兜底生成营销文稿，支持微信群/朋友圈/商家转发渠道'
  })
  generateCopies(@Body() body: GenerateCopyDto) {
    return this.copyService.generateCopies({
      packageId: body.packageId,
      channel: body.channel,
      scenario: body.scenario ?? '',
      tone: body.tone ?? '',
      copyCount: Number(body.copyCount ?? 1),
      extraInstruction: body.extraInstruction,
      useAI: body.useAI,
      createdBy: body.createdBy
    });
  }

  @Get('copies')
  listCopies(
    @Query('auditStatus') auditStatus?: AuditStatus,
    @Query('channel') channel?: Channel,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    const parsedPage = Number(page);
    const parsedPageSize = Number(pageSize);
    const safePage = Number.isFinite(parsedPage) ? parsedPage : undefined;
    const safePageSize = Number.isFinite(parsedPageSize) ? parsedPageSize : undefined;
    return this.copyService.listCopies({ auditStatus, channel }, safePage, safePageSize);
  }

  @Post('copies/:contentId/audit')
  auditCopy(@Param('contentId') contentId: string, @Body() body: AuditCopyDto) {
    return this.copyService.auditCopy(contentId, body);
  }
}
