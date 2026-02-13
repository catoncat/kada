import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

interface IdentityReferenceItem {
  index: number;
  role?: string;
  image: string;
}

const COLLAGE_RENDER_VERSION = 'v2';

function normalizeLocalUploadPath(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw.slice(1);
  if (raw.startsWith('uploads/')) return raw;
  return null;
}

function getDataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), 'data');
}

function buildHash(items: IdentityReferenceItem[]): string {
  const h = createHash('sha1');
  h.update(`${COLLAGE_RENDER_VERSION}\n`);
  for (const item of items) {
    h.update(`${item.index}|${item.role || ''}|${item.image}\n`);
  }
  return h.digest('hex').slice(0, 12);
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function getOrCreateIdentityReferenceCollage(
  items: IdentityReferenceItem[],
): Promise<string | null> {
  if (!Array.isArray(items) || items.length <= 1) return null;

  const normalized: Array<
    IdentityReferenceItem & { localPath: string; fullPath: string }
  > = [];
  const dataDir = getDataDir();
  for (const item of items) {
    const localPath = normalizeLocalUploadPath(item.image);
    if (!localPath) return null;
    const fullPath = join(dataDir, localPath);
    if (!existsSync(fullPath)) return null;
    normalized.push({ ...item, localPath, fullPath });
  }

  const hash = buildHash(items);
  const filename = `identity-collage-${COLLAGE_RENDER_VERSION}-${hash}.jpg`;
  const localUploadPath = join('uploads', filename);
  const fullPath = join(dataDir, localUploadPath);
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });

  if (existsSync(fullPath)) {
    const collageMtime = statSync(fullPath).mtimeMs;
    const sourceNewest = Math.max(
      ...normalized.map((item) => statSync(item.fullPath).mtimeMs),
    );
    if (collageMtime >= sourceNewest) {
      return `/${localUploadPath}`;
    }
  }

  const tileSize = 448;
  const gap = 16;
  const outer = 20;
  const columns = normalized.length <= 2 ? normalized.length : 2;
  const rows = Math.ceil(normalized.length / columns);
  const width = outer * 2 + columns * tileSize + (columns - 1) * gap;
  const height = outer * 2 + rows * tileSize + (rows - 1) * gap;

  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  const rects: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
    label: string;
  }> = [];

  for (let i = 0; i < normalized.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const left = outer + col * (tileSize + gap);
    const top = outer + row * (tileSize + gap);
    const item = normalized[i];
    const resized = await sharp(readFileSync(item.fullPath), { failOn: 'none' })
      .rotate()
      .resize(tileSize, tileSize, {
        fit: 'cover',
      })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    composites.push({ input: resized, left, top });
    rects.push({
      left,
      top,
      width: tileSize,
      height: tileSize,
      label: item.role ? `#${item.index} ${item.role}` : `#${item.index}`,
    });
  }

  const rectSvg = rects
    .map(
      (rect) => `
      <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="none" stroke="#ef4444" stroke-width="5" />
      <rect x="${rect.left}" y="${rect.top}" width="${Math.min(180, rect.width)}" height="36" fill="#ef4444" />
      <text x="${rect.left + 10}" y="${rect.top + 24}" fill="#ffffff" font-size="16" font-family="Arial, sans-serif" font-weight="700">${escapeSvgText(rect.label)}</text>
    `,
    )
    .join('\n');

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      ${rectSvg}
    </svg>`,
    'utf8',
  );

  const output = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([...composites, { input: svg, left: 0, top: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  writeFileSync(fullPath, output);
  return `/${localUploadPath}`;
}
