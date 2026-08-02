import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function getTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results.push(...getTsFiles(filePath));
    } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

describe('Architecture Boundary Contracts', () => {
  const srcDir = path.join(__dirname, '../src');

  it('Repositories layer must not import Controller or Express HTTP types', () => {
    const repositoryFiles = getTsFiles(srcDir).filter(
      (f) => f.includes('/repositories/') || f.includes('\\repositories\\')
    );
    expect(repositoryFiles.length).toBeGreaterThan(0);

    for (const file of repositoryFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/from ['"]express['"]/);
      expect(content).not.toMatch(/from ['"]@nestjs\/common['"].*(?:Controller|Get|Post|Req|Res)/);
      expect(content).not.toMatch(/from ['"].*\/.*controller['"]/i);
    }
  });

  it('Domain layer must be pure and not import PrismaService or ORM directly', () => {
    const domainFiles = getTsFiles(srcDir).filter(
      (f) => f.includes('/domain/') || f.includes('\\domain\\')
    );
    expect(domainFiles.length).toBeGreaterThan(0);

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/PrismaService/);
      expect(content).not.toMatch(/from ['"].*prisma\.service['"]/);
    }
  });

  it('Application layer services must not import Controllers', () => {
    const appFiles = getTsFiles(srcDir).filter(
      (f) => f.includes('/application/') || f.includes('\\application\\')
    );
    expect(appFiles.length).toBeGreaterThan(0);

    for (const file of appFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/from ['"].*controller['"]/i);
    }
  });
});
