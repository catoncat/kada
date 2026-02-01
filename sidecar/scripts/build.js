import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tauriDir = path.resolve(rootDir, '..', 'src-tauri');
const binariesDir = path.join(tauriDir, 'binaries');

// 获取平台信息
const ext = process.platform === 'win32' ? '.exe' : '';
const targetTriple = execSync('rustc --print host-tuple').toString().trim();

if (!targetTriple) {
  console.error('Failed to determine platform target triple');
  process.exit(1);
}

console.log(`🔧 Building sidecar for: ${targetTriple}`);

// 确保 binaries 目录存在
if (!fs.existsSync(binariesDir)) {
  fs.mkdirSync(binariesDir, { recursive: true });
}

// 使用 pkg 打包
console.log('📦 Packaging with pkg...');
execSync('npx @yao-pkg/pkg src/index.ts --target node22 --output sidecar', {
  cwd: rootDir,
  stdio: 'inherit',
});

// 重命名并移动到 Tauri binaries 目录
const srcPath = path.join(rootDir, `sidecar${ext}`);
const destPath = path.join(binariesDir, `sidecar-${targetTriple}${ext}`);

console.log(`📁 Moving: ${srcPath} -> ${destPath}`);
fs.renameSync(srcPath, destPath);

console.log('✅ Sidecar build complete!');
console.log(`   Target: ${destPath}`);
