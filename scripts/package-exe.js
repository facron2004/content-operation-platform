const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📦 开始打包内容运营系统...\n');

// 1. 确保构建产物存在
console.log('1️⃣ 检查构建产物...');
const apiDistPath = path.join(__dirname, '../apps/api/dist');
const webDistPath = path.join(__dirname, '../apps/web/dist');

if (!fs.existsSync(apiDistPath)) {
  console.error('❌ 后端构建产物不存在，请先运行 npm run build');
  process.exit(1);
}

if (!fs.existsSync(webDistPath)) {
  console.error('❌ 前端构建产物不存在，请先运行 npm run build');
  process.exit(1);
}

// 2. 复制前端构建产物到后端 public 目录
console.log('2️⃣ 复制前端资源...');
const publicPath = path.join(apiDistPath, 'public');
if (fs.existsSync(publicPath)) {
  fs.rmSync(publicPath, { recursive: true, force: true });
}
fs.mkdirSync(publicPath, { recursive: true });

// 复制前端文件
const copyRecursive = (src, dest) => {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(file => {
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};

copyRecursive(webDistPath, publicPath);
console.log('   ✅ 前端资源已复制');

// 3. 复制必要的资源文件
console.log('3️⃣ 复制资源文件...');
const resourcesToCopy = [
  { src: '.env.example', dest: path.join(apiDistPath, '.env.example') },
  { src: 'prisma/schema.prisma', dest: path.join(apiDistPath, 'schema.prisma') }
];

resourcesToCopy.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`   ✅ 已复制 ${src}`);
  }
});

// 4. 使用 pkg 打包
console.log('4️⃣ 打包成 exe...');
const outputDir = path.join(__dirname, '../dist');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

try {
  execSync(
    `npx pkg apps/api/package.json --targets node18-win-x64 --output dist/content-ops.exe --compress GZip --public`,
    { stdio: 'inherit', cwd: path.join(__dirname, '..') }
  );
  console.log('   ✅ exe 打包完成');
} catch (error) {
  console.error('❌ 打包失败:', error.message);
  process.exit(1);
}

// 5. 复制运行时需要的文件到 dist 目录
console.log('5️⃣ 准备运行时文件...');
const runtimeFiles = [
  { src: '.env.example', dest: path.join(outputDir, '.env.example') },
  { src: 'prisma/schema.prisma', dest: path.join(outputDir, 'schema.prisma') }
  // 不再复制 prisma/dev.db：首次启动时由 seed-data.ts 自动初始化，避免把旧数据带进发布包
];

runtimeFiles.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`   ✅ 已复制 ${src}`);
  }
});

// 复制 public 目录
const distPublicPath = path.join(outputDir, 'public');
if (fs.existsSync(distPublicPath)) {
  fs.rmSync(distPublicPath, { recursive: true, force: true });
}
copyRecursive(publicPath, distPublicPath);

// 复制 Prisma 客户端到 dist/node_modules（只复制 SQLite 相关文件）
console.log('   📦 复制 Prisma 客户端...');
const prismaClientSrc = path.join(__dirname, '../node_modules/.prisma');
const prismaClientDest = path.join(outputDir, 'node_modules/.prisma');
if (fs.existsSync(prismaClientSrc)) {
  copyRecursive(prismaClientSrc, prismaClientDest);

  // 删除临时文件
  const clientDir = path.join(prismaClientDest, 'client');
  if (fs.existsSync(clientDir)) {
    const files = fs.readdirSync(clientDir);
    files.forEach(file => {
      if (file.includes('.tmp')) {
        fs.unlinkSync(path.join(clientDir, file));
      }
    });
  }
}

const prismaModuleSrc = path.join(__dirname, '../node_modules/@prisma/client');
const prismaModuleDest = path.join(outputDir, 'node_modules/@prisma/client');
if (fs.existsSync(prismaModuleSrc)) {
  // 创建目标目录
  fs.mkdirSync(prismaModuleDest, { recursive: true });

  // 复制必要的文件
  const essentialFiles = [
    'index.js', 'index.d.ts', 'default.js', 'default.d.ts',
    'package.json', 'LICENSE', 'README.md'
  ];

  essentialFiles.forEach(file => {
    const src = path.join(prismaModuleSrc, file);
    const dest = path.join(prismaModuleDest, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });

  // 只复制 SQLite 相关的 runtime 文件
  const runtimeSrc = path.join(prismaModuleSrc, 'runtime');
  const runtimeDest = path.join(prismaModuleDest, 'runtime');
  fs.mkdirSync(runtimeDest, { recursive: true });

  const runtimeFiles = fs.readdirSync(runtimeSrc);
  runtimeFiles.forEach(file => {
    // 排除其他数据库的文件，只保留 SQLite 和通用文件
    const isOtherDb = file.includes('mysql') || file.includes('postgresql') ||
                      file.includes('sqlserver') || file.includes('cockroachdb');
    const isSqlite = file.includes('sqlite');
    const isCommon = file.includes('library') || file.includes('binary') ||
                     file.includes('client') || file.includes('index') ||
                     file.endsWith('.d.ts') || file.endsWith('.d.mts');

    if (isSqlite || (isCommon && !isOtherDb)) {
      const src = path.join(runtimeSrc, file);
      const dest = path.join(runtimeDest, file);
      fs.copyFileSync(src, dest);
    }
  });

  console.log('   ✅ 已优化 Prisma 客户端（仅 SQLite）');
}

console.log('   ✅ 运行时文件已准备');

// 6. 创建使用说明
console.log('6️⃣ 生成使用说明...');
const readme = `# 内容运营系统 - 独立版

## 使用方法

1. 首次使用，复制 .env.example 为 .env，并配置必要参数：
   - EXTERNAL_API_BASE_URL: 外部API地址
   - EXTERNAL_API_USERNAME: 用户名
   - EXTERNAL_API_PASSWORD: 密码
   - DEEPSEEK_API_KEY: DeepSeek API密钥（可选，用于AI文案生成）

2. 双击 content-ops.exe 启动系统

3. 系统会自动打开浏览器访问 http://localhost:3100

4. 使用完毕后，关闭命令行窗口即可停止服务

## 目录结构

- content-ops.exe - 主程序
- .env - 配置文件（需要自己创建）
- .env.example - 配置示例
- public/ - 前端资源
- schema.prisma - 数据库模型

## 注意事项

- 首次运行会自动创建数据库文件 dev.db
- 数据库文件保存在当前目录
- 请勿删除 public 目录
- 如需更新配置，修改 .env 文件后重启程序

## 技术支持

如有问题，请查看日志输出或联系开发团队。
`;

fs.writeFileSync(path.join(outputDir, 'README.txt'), readme, 'utf-8');
console.log('   ✅ 使用说明已生成');

console.log('\n✅ 打包完成！');
console.log(`\n📁 输出目录: ${outputDir}`);
console.log('📝 使用说明: dist/README.txt');
console.log('\n🚀 运行方式:');
console.log('   1. 进入 dist 目录');
console.log('   2. 复制 .env.example 为 .env 并配置');
console.log('   3. 双击 content-ops.exe\n');
