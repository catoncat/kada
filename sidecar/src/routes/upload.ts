import { Hono } from 'hono';
import sharp from 'sharp';
import path from 'node:path';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const uploadRoutes = new Hono();

// 获取上传目录
function getUploadDir(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const uploadDir = path.join(dataDir, 'uploads');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

// 上传并压缩图片
uploadRoutes.post('/', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: '请提供图片文件' }, 400);
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: '不支持的图片格式，请使用 JPG/PNG/WebP/GIF' }, 400);
    }

    // 读取文件 buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用 sharp 压缩图片
    const compressed = await sharp(buffer)
      .resize(1920, 1920, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    // 生成文件名并保存
    const filename = `${randomUUID()}.jpg`;
    const uploadDir = getUploadDir();
    const filepath = path.join(uploadDir, filename);

    writeFileSync(filepath, compressed);

    return c.json({
      filename,
      path: `/uploads/${filename}`,
      size: compressed.length,
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `上传失败: ${message}` }, 500);
  }
});

// 删除图片
uploadRoutes.delete('/:filename', (c) => {
  try {
    const filename = c.req.param('filename');

    // 安全检查：防止路径遍历
    if (filename.includes('..') || filename.includes('/')) {
      return c.json({ error: '无效的文件名' }, 400);
    }

    const uploadDir = getUploadDir();
    const filepath = path.join(uploadDir, filename);

    if (!existsSync(filepath)) {
      return c.json({ error: '文件不存在' }, 404);
    }

    unlinkSync(filepath);
    return c.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `删除失败: ${message}` }, 500);
  }
});
