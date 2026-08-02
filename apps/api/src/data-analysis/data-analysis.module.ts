import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataAnalysisController } from './data-analysis.controller';
import { DataAnalysisService } from './data-analysis.service';
import { DataFreshnessService } from './data-freshness.service';

@Module({
  imports: [PrismaModule],
  controllers: [DataAnalysisController],
  providers: [DataAnalysisService, DataFreshnessService],
  exports: [DataAnalysisService, DataFreshnessService]
})
export class DataAnalysisModule {}
