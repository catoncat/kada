import { execFile } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetectFacesResult {
  width: number;
  height: number;
  faces: FaceBox[];
}

const DEFAULT_FACE_BLUR_SIGMA = 28;
const DEFAULT_FACE_PADDING_RATIO = 0.2;
const SWIFT_TIMEOUT_MS = 7000;

const thisFilePath = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFilePath);
const sidecarRoot = join(thisDir, '..', '..');
const detectFacesScriptPath = join(
  sidecarRoot,
  'scripts',
  'detect-faces.swift',
);

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

function toPublicUploadPath(localUploadPath: string): string {
  return `/${localUploadPath}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function detectFacesLocal(
  imagePath: string,
): Promise<DetectFacesResult | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve(null);
      return;
    }
    if (!existsSync(detectFacesScriptPath)) {
      resolve(null);
      return;
    }
    execFile(
      'swift',
      [detectFacesScriptPath, imagePath],
      {
        timeout: SWIFT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim()) as DetectFacesResult;
          if (!Array.isArray(parsed.faces)) {
            resolve(null);
            return;
          }
          resolve(parsed);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

async function buildFaceBlurComposite(
  sourceBuffer: Buffer,
  width: number,
  height: number,
  faces: FaceBox[],
): Promise<Buffer> {
  const overlays: Array<{ input: Buffer; top: number; left: number }> = [];
  const annotationRects: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
  }> = [];

  for (const face of faces) {
    const paddingX = face.width * DEFAULT_FACE_PADDING_RATIO;
    const paddingY = face.height * DEFAULT_FACE_PADDING_RATIO;

    const left = clamp(Math.floor((face.x - paddingX) * width), 0, width - 1);
    const top = clamp(Math.floor((face.y - paddingY) * height), 0, height - 1);
    const right = clamp(
      Math.ceil((face.x + face.width + paddingX) * width),
      1,
      width,
    );
    const bottom = clamp(
      Math.ceil((face.y + face.height + paddingY) * height),
      1,
      height,
    );

    const rectWidth = right - left;
    const rectHeight = bottom - top;
    if (rectWidth <= 1 || rectHeight <= 1) continue;

    const patch = await sharp(sourceBuffer)
      .extract({
        left,
        top,
        width: rectWidth,
        height: rectHeight,
      })
      .blur(DEFAULT_FACE_BLUR_SIGMA)
      .toBuffer();

    overlays.push({
      input: patch,
      left,
      top,
    });
    annotationRects.push({ left, top, width: rectWidth, height: rectHeight });
  }

  if (overlays.length === 0) {
    return sourceBuffer;
  }

  const annotations = annotationRects
    .map(
      (rect, index) => `
      <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="none" stroke="#ef4444" stroke-width="4" />
      <rect x="${rect.left}" y="${Math.max(0, rect.top - 30)}" width="48" height="30" fill="#ef4444" />
      <text x="${rect.left + 24}" y="${Math.max(18, rect.top - 10)}" text-anchor="middle" fill="#ffffff" font-size="16" font-family="Arial, sans-serif" font-weight="700">S${index + 1}</text>
    `,
    )
    .join('\n');

  const annotationSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${annotations}</svg>`,
    'utf8',
  );

  return sharp(sourceBuffer)
    .composite([...overlays, { input: annotationSvg, left: 0, top: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

function buildSanitizedFilename(localUploadPath: string): string {
  const parsed = parse(localUploadPath);
  const ext = extname(parsed.base).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    return `${parsed.name}.scene-noface.jpg`;
  }
  return `${parsed.name}.scene-noface.jpg`;
}

export async function getOrCreateSanitizedSceneReferenceImage(
  imagePath: string,
): Promise<string> {
  const localUploadPath = normalizeLocalUploadPath(imagePath);
  if (!localUploadPath) return imagePath;
  if (localUploadPath.includes('.scene-noface.')) {
    return toPublicUploadPath(localUploadPath);
  }

  const dataDir = getDataDir();
  const sourceFullPath = join(dataDir, localUploadPath);
  if (!existsSync(sourceFullPath)) return imagePath;

  const sanitizedFilename = buildSanitizedFilename(localUploadPath);
  const sanitizedLocalPath = join('uploads', sanitizedFilename);
  const sanitizedFullPath = join(dataDir, sanitizedLocalPath);
  mkdirSync(dirname(sanitizedFullPath), { recursive: true });

  if (existsSync(sanitizedFullPath)) {
    const sourceStat = statSync(sourceFullPath);
    const sanitizedStat = statSync(sanitizedFullPath);
    if (sanitizedStat.mtimeMs >= sourceStat.mtimeMs) {
      return toPublicUploadPath(sanitizedLocalPath);
    }
  }

  const sourceBuffer = readFileSync(sourceFullPath);
  const metadata = await sharp(sourceBuffer, { failOn: 'none' }).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (width <= 0 || height <= 0) {
    return imagePath;
  }

  const detectResult = await detectFacesLocal(sourceFullPath);
  if (
    !detectResult ||
    !Array.isArray(detectResult.faces) ||
    detectResult.faces.length === 0
  ) {
    // 没检测到人脸时也产出缓存副本，避免后续重复检测。
    copyFileSync(sourceFullPath, sanitizedFullPath);
    return toPublicUploadPath(sanitizedLocalPath);
  }

  const sanitizedBuffer = await buildFaceBlurComposite(
    sourceBuffer,
    width,
    height,
    detectResult.faces,
  );
  writeFileSync(sanitizedFullPath, sanitizedBuffer);
  return toPublicUploadPath(sanitizedLocalPath);
}

export async function warmSceneReferenceSanitization(
  imagePath?: string | null,
): Promise<void> {
  if (!imagePath) return;
  try {
    await getOrCreateSanitizedSceneReferenceImage(imagePath);
  } catch {
    // ignore warm-up failures; generation flow会做兜底
  }
}

export async function sanitizeSceneReferenceImages(
  values: string[],
): Promise<string[]> {
  const output: string[] = [];
  for (const value of values) {
    try {
      output.push(await getOrCreateSanitizedSceneReferenceImage(value));
    } catch {
      output.push(value);
    }
  }
  return output;
}
