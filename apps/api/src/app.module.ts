import { Module } from '@nestjs/common';
import { ContentModule } from './content/content.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ContentModule]
})
export class AppModule {}

