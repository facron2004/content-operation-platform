import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { AuditStatus, Channel } from '@content/shared';
import { ContentService } from './content.service';
import { GenerateCopyDto, AuditCopyDto } from './content.dto';

@ApiTags('copy')
@Controller('api/content')
export class CopyController {
  constructor(@Inject(ContentService) private readonly contentService: ContentService) {}

  @Post('generate')
  @ApiOperation({ summary: '生成文稿', description: 'AI 或规则兜底生成营销文稿，支持微信群/朋友圈/商家转发渠道' })
  generateCopies(@Body() body: GenerateCopyDto) {
    return this.contentService.generateCopies({
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
  listCopies(@Query('auditStatus') auditStatus?: AuditStatus, @Query('channel') channel?: Channel) {
    return this.contentService.listCopies({ auditStatus, channel });
  }

  @Post('copies/:contentId/audit')
  auditCopy(@Param('contentId') contentId: string, @Body() body: AuditCopyDto) {
    return this.contentService.auditCopy(contentId, body);
  }
}