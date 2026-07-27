import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataAnalysisController } from './data-analysis.controller';
import { DataAnalysisService } from './data-analysis.service';

@Module({
  imports: [PrismaModule],
  controllers: [DataAnalysisController],
  providers: [DataAnalysisService],
  exports: [DataAnalysisService]
})
export class DataAnalysisModule {}
