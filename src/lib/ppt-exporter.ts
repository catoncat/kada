import type { ProjectPlan, ScenePlan } from '@/types/project-plan';
import { buildProjectTitle } from '@/lib/plan-title';
import { PPT_STYLES, type PptStyle } from './ppt-templates';

/**
 * 注意：
 * - 为了保持“极简高级”的版心感，导出使用固定网格与留白。
 * - 图片只支持 data:image/... 的 dataURL。
 */

export interface ShootingPlan {
  title: string;
  theme: string;
  creativeIdea: string;
  copywriting: string;
  scenes: {
    location: string;
    description: string;
    shots: string;
    visualPrompt?: string;
  }[];
}

type ExportImages = Record<number, string>; // sceneIndex -> dataURL

const SLIDE = {
  w: 13.33,
  h: 7.5,
};

const GRID = {
  x: 0.75,
  yHeader: 0.55,
  headerH: 1.15,
  gap: 0.4,
  leftW: 7.1,
  rightW: 4.8,
  contentTop: 1.9,
  imageY: 2.05,
  imageH: 4.95,
};

function safe(v: any): string {
  return typeof v === 'string' ? v : '';
}

function compactSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function truncateText(s: string, maxChars: number): string {
  const t = compactSpaces(s || '');
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function bulletsFromText(s: string, maxBullets = 6): string {
  const raw = (s || '').trim();
  if (!raw) return '';
  const parts = raw
    .split(/\n|；|;|。/)
    .map((x) => compactSpaces(x))
    .filter(Boolean)
    .slice(0, maxBullets);
  if (!parts.length) return '';
  return parts.map((x) => `• ${x}`).join('\n');
}

function isEmbeddableDataUrl(v?: string): boolean {
  return !!v && typeof v === 'string' && v.startsWith('data:image/');
}

function addBackground(slide: any, style: PptStyle) {
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE.w,
    h: SLIDE.h,
    fill: { color: style.colors.paper },
    line: { color: style.colors.paper },
  });
}

function addAccentBar(slide: any, hex: string, transparency = 82) {
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE.w,
    h: 0.11,
    fill: { color: hex, transparency },
    line: { color: hex, transparency: 100 },
  });
}

function addFooterPageNumber(slide: any, pageNo: number, style: PptStyle) {
  slide.addText(String(pageNo), {
    x: 12.45,
    y: 7.18,
    w: 0.8,
    h: 0.25,
    fontSize: 9,
    fontFace: style.fonts.body,
    color: style.colors.light,
    align: 'right',
  });
}

function addHeader(slide: any, title: string, style: PptStyle, subtitle?: string) {
  slide.addText(truncateText(title, 60), {
    x: GRID.x,
    y: GRID.yHeader,
    w: SLIDE.w - GRID.x * 2,
    h: 0.6,
    fontSize: 30,
    fontFace: style.fonts.title,
    bold: true,
    color: style.colors.ink,
  });

  if (subtitle) {
    slide.addText(truncateText(subtitle, 90), {
      x: GRID.x,
      y: GRID.yHeader + 0.62,
      w: SLIDE.w - GRID.x * 2,
      h: 0.35,
      fontSize: 13,
      fontFace: style.fonts.body,
      color: style.colors.sub,
    });
  }

  slide.addShape('rect', {
    x: GRID.x,
    y: GRID.yHeader + GRID.headerH,
    w: SLIDE.w - GRID.x * 2,
    h: 0.02,
    fill: { color: style.colors.line, transparency: 25 },
    line: { color: style.colors.line, transparency: 100 },
  });
}

function addCard(
  slide: any,
  style: PptStyle,
  {
    x,
    y,
    w,
    h,
    label,
    body,
    bodyFontSize = 13,
    bullets = false,
  }: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    body: string;
    bodyFontSize?: number;
    bullets?: boolean;
  }
) {
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: style.colors.paper2 },
    line: { color: style.colors.line, width: 1 },
  });

  slide.addText(label, {
    x: x + 0.22,
    y: y + 0.16,
    w: w - 0.44,
    h: 0.25,
    fontSize: 10,
    fontFace: style.fonts.body,
    color: style.colors.light,
    bold: true,
  });

  const content = bullets ? bulletsFromText(body) : compactSpaces(body);
  const capped = truncateText(content || '—', bullets ? 220 : 320);

  slide.addText(capped || '—', {
    x: x + 0.22,
    y: y + 0.46,
    w: w - 0.44,
    h: h - 0.62,
    fontSize: bodyFontSize,
    fontFace: style.fonts.body,
    color: style.colors.ink,
    valign: 'top',
  });
}

function addFramedImage(
  slide: any,
  style: PptStyle,
  {
    x,
    y,
    w,
    h,
    imageDataUrl,
    placeholder,
  }: {
    x: number;
    y: number;
    w: number;
    h: number;
    imageDataUrl?: string;
    placeholder?: string;
  }
) {
  const pad = 0.14;
  const canEmbed = isEmbeddableDataUrl(imageDataUrl);

  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: style.colors.paper },
    line: { color: style.colors.line, width: 1 },
  });

  if (canEmbed) {
    slide.addImage({
      data: imageDataUrl!,
      x: x + pad,
      y: y + pad,
      w: w - pad * 2,
      h: h - pad * 2,
    });
  } else {
    const text = imageDataUrl
      ? '图片格式不支持导出'
      : placeholder || '未生成参考图';
    slide.addText(text, {
      x,
      y: y + h / 2 - 0.2,
      w,
      h: 0.4,
      fontSize: 10,
      fontFace: style.fonts.body,
      color: style.colors.light,
      align: 'center',
    });
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function getReadableTextColor(bgHex: string, style: PptStyle): string {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return style.colors.paper;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.62 ? style.colors.ink : style.colors.paper;
}

function normalizeColorToHex(input?: string): string {
  const raw = (input || '').trim();
  if (!raw) return 'CBB89C';

  const first = raw.split(/[+、,，/\s]/).filter(Boolean)[0] || raw;
  const hex = first.startsWith('#') ? first.slice(1) : first;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();

  const map: Record<string, string> = {
    白: 'F2F0EA', 米白: 'EFE6D8', 奶油: 'F3E7D2', 黑: '111827', 灰: 'B8B5AE',
    红: 'C05A5A', 粉: 'E7B8C0', 蓝: '7BA6C9', 绿: '86B3A1', 黄: 'E2C36B',
    紫: 'B39BC8', 卡其: 'CBB89C', 棕: '9B7A62', 咖: '8A6A58', 橙: 'D79A6E',
  };

  for (const k of Object.keys(map)) {
    if (first.includes(k)) return map[k];
  }
  return 'CBB89C';
}

function sceneTypeLabel(type: any): string {
  if (type === '主场景') return '主场景';
  if (type === '叠搭A') return '叠搭A';
  if (type === '叠搭B') return '叠搭B';
  if (type === '纯色版面') return '纯色版面';
  return safe(type) || '场景';
}

function getLookAccentHex(project: ProjectPlan, lookIdx: number): string {
  const plan = project.plans[lookIdx];
  const byId = plan?.outfitId ? project.outfits.find((o) => o.id === plan.outfitId) : null;
  const byIndex = project.outfits[lookIdx];
  const colorText = byId?.color || byIndex?.color || '';
  return normalizeColorToHex(colorText);
}

function addCollage2x2(
  slide: any,
  style: PptStyle,
  {
    x,
    y,
    w,
    h,
    images,
    labels,
    accentHex,
  }: {
    x: number;
    y: number;
    w: number;
    h: number;
    images: (string | undefined)[];
    labels?: string[];
    accentHex?: string;
  }
) {
  const gap = 0.12;
  const cellW = (w - gap) / 2;
  const cellH = (h - gap) / 2;
  const badgeBg = (accentHex || '111827').toUpperCase();
  const badgeText = getReadableTextColor(badgeBg, style);

  for (let i = 0; i < 4; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const cx = x + col * (cellW + gap);
    const cy = y + row * (cellH + gap);

    addFramedImage(slide, style, {
      x: cx,
      y: cy,
      w: cellW,
      h: cellH,
      imageDataUrl: images[i],
      placeholder: labels?.[i] ? `未生成：${labels[i]}` : '未生成图片',
    });

    if (labels?.[i]) {
      slide.addShape('rect', {
        x: cx,
        y: cy,
        w: cellW,
        h: 0.3,
        fill: { color: badgeBg, transparency: 35 },
        line: { color: badgeBg, transparency: 100 },
      });
      slide.addText(labels[i], {
        x: cx + 0.12,
        y: cy + 0.06,
        w: cellW - 0.24,
        h: 0.24,
        fontSize: 9,
        fontFace: style.fonts.body,
        color: badgeText,
      });
    }
  }
}

/**
 * 导出单主题
 */
export const exportToPPT = async (
  plan: ShootingPlan, 
  opts?: { images?: ExportImages; styleId?: string }
) => {
  const pptxgen = (await import('pptxgenjs')).default;
  const pres = new pptxgen();
  const style = PPT_STYLES[opts?.styleId || 'minimal'] || PPT_STYLES.minimal;

  let pageNo = 1;

  // 1. 封面
  let slide = pres.addSlide();
  addBackground(slide, style);
  addAccentBar(slide, style.colors.accent || '111827', 88);
  addFooterPageNumber(slide, pageNo++, style);

  slide.addText(truncateText(plan.title, 40), {
    x: GRID.x,
    y: 2.0,
    w: SLIDE.w - GRID.x * 2,
    h: 1.0,
    fontSize: 40,
    fontFace: style.fonts.title,
    bold: true,
    color: style.colors.ink,
  });

  slide.addText(`主题：${truncateText(plan.theme, 80)}`, {
    x: GRID.x,
    y: 3.05,
    w: SLIDE.w - GRID.x * 2,
    h: 0.4,
    fontSize: 14,
    fontFace: style.fonts.body,
    color: style.colors.sub,
  });

  // 2. 目录页 (新增)
  slide = pres.addSlide();
  addBackground(slide, style);
  addAccentBar(slide, style.colors.accent || '111827', 90);
  addFooterPageNumber(slide, pageNo++, style);
  addHeader(slide, '目录 / CONTENTS', style, plan.title);

  const tocItems = ['01 创意思路', '02 文案脚本', '03 拍摄分镜'];
  tocItems.forEach((item, i) => {
    slide.addText(item, {
      x: GRID.x + 0.5,
      y: 2.5 + i * 0.8,
      w: 4,
      h: 0.5,
      fontSize: 20,
      fontFace: style.fonts.title,
      color: style.colors.ink,
    });
  });

  // 3. 创意思考
  slide = pres.addSlide();
  addBackground(slide, style);
  addAccentBar(slide, style.colors.accent || '111827', 92);
  addFooterPageNumber(slide, pageNo++, style);
  addHeader(slide, '01 创意思路', style, plan.title);

  addCard(slide, style, {
    x: GRID.x,
    y: GRID.contentTop,
    w: SLIDE.w - GRID.x * 2,
    h: 5.2,
    label: 'CREATIVE IDEA',
    body: plan.creativeIdea,
    bodyFontSize: 14,
  });

  // 4. 文案脚本
  slide = pres.addSlide();
  addBackground(slide, style);
  addAccentBar(slide, style.colors.accent || '111827', 92);
  addFooterPageNumber(slide, pageNo++, style);
  addHeader(slide, '02 文案脚本', style, plan.title);

  addCard(slide, style, {
    x: GRID.x,
    y: GRID.contentTop,
    w: SLIDE.w - GRID.x * 2,
    h: 5.2,
    label: 'COPYWRITING',
    body: plan.copywriting,
    bodyFontSize: 16,
  });

  // 5. 分镜
  const leftX = GRID.x;
  const leftW = GRID.leftW;
  const rightX = GRID.x + GRID.leftW + GRID.gap;
  const rightW = GRID.rightW;

  plan.scenes.forEach((scene, index) => {
    slide = pres.addSlide();
    addBackground(slide, style);
    addAccentBar(slide, style.colors.accent || '111827', 94);
    addFooterPageNumber(slide, pageNo++, style);

    addHeader(slide, `03 分镜 ${index + 1}`, style, scene.location);

    addCard(slide, style, {
      x: leftX,
      y: GRID.contentTop,
      w: leftW,
      h: 2.35,
      label: '场景描述 / DESCRIPTION',
      body: scene.description,
      bodyFontSize: 13,
    });

    addCard(slide, style, {
      x: leftX,
      y: GRID.contentTop + 2.55,
      w: leftW,
      h: 2.2,
      label: '镜头建议 / SHOTS',
      body: scene.shots,
      bullets: true,
      bodyFontSize: 13,
    });

    addFramedImage(slide, style, {
      x: rightX,
      y: GRID.imageY,
      w: rightW,
      h: GRID.imageH,
      imageDataUrl: opts?.images?.[index],
    });

    if (scene.visualPrompt) {
      slide.addText(`Visual Prompt: ${truncateText(scene.visualPrompt, 120)}`, {
        x: leftX,
        y: 7.18,
        w: 10.8,
        h: 0.25,
        fontSize: 8,
        fontFace: style.fonts.body,
        color: style.colors.light,
      });
    }
  });

  await pres.writeFile({ fileName: `${plan.title}_拍摄预案.pptx` });
};

/**
 * 导出多服装项目
 */
export const exportProjectToPPT = async (
  project: ProjectPlan,
  opts?: { fileName?: string; images?: ExportImages; styleId?: string }
) => {
  const pptxgen = (await import('pptxgenjs')).default;
  const pres = new pptxgen();
  const style = PPT_STYLES[opts?.styleId || 'minimal'] || PPT_STYLES.minimal;

  const projectTitle = buildProjectTitle(project.client);
  const firstAccent = getLookAccentHex(project, 0);

  let pageNo = 1;

  // 1. 项目封面
  let slide = pres.addSlide();
  addBackground(slide, style);
  addAccentBar(slide, style.colors.accent || firstAccent, 82);
  addFooterPageNumber(slide, pageNo++, style);

  slide.addText(truncateText(projectTitle, 40), {
    x: GRID.x,
    y: 1.85,
    w: SLIDE.w - GRID.x * 2,
    h: 0.8,
    fontSize: 38,
    fontFace: style.fonts.title,
    bold: true,
    color: style.colors.ink,
  });

  slide.addText(`客户：${project.client.age ?? '未知'}岁｜${project.client.gender}${project.client.usage ? `｜${project.client.usage}` : ''}`, {
    x: GRID.x,
    y: 2.75,
    w: SLIDE.w - GRID.x * 2,
    h: 0.4,
    fontSize: 13,
    fontFace: style.fonts.body,
    color: style.colors.sub,
  });

  // 2. 目录页
  slide = pres.addSlide();
  addBackground(slide, style);
  addAccentBar(slide, style.colors.accent || firstAccent, 85);
  addFooterPageNumber(slide, pageNo++, style);
  addHeader(slide, 'CONTENTS / 目录', style, projectTitle);

  project.plans.forEach((p, i) => {
    const lookName = p.themeTitle || p.outfitName || `Look ${i + 1}`;
    slide.addText(`LOOK ${i + 1}: ${truncateText(lookName, 30)}`, {
      x: GRID.x + 0.5,
      y: 2.5 + i * 0.6,
      w: 8,
      h: 0.4,
      fontSize: 18,
      fontFace: style.fonts.title,
      color: style.colors.ink,
    });
  });

  // 3. 服装预览页 (原 Look 列表卡片)
  slide = pres.addSlide();
  addBackground(slide, style);
  addAccentBar(slide, style.colors.accent || firstAccent, 85);
  addFooterPageNumber(slide, pageNo++, style);
  addHeader(slide, 'OUTFITS / 服装预览', style, projectTitle);

  const colGap = 0.22;
  const colW = (SLIDE.w - GRID.x * 2 - colGap * 2) / 3;
  project.plans.slice(0, 3).forEach((p, i) => {
    const x = GRID.x + i * (colW + colGap);
    const cardY = 2.2;
    const cardH = 4.8;
    
    slide.addShape('rect', {
      x, y: cardY, w: colW, h: cardH,
      fill: { color: style.colors.paper2 },
      line: { color: style.colors.line, width: 1 },
    });

    slide.addText(`LOOK ${i + 1}`, {
      x: x + 0.18, y: cardY + 0.15, w: colW - 0.36, h: 0.25,
      fontSize: 10, fontFace: style.fonts.body, color: style.colors.light, bold: true,
    });

    slide.addText(truncateText(p.themeTitle || p.outfitName || `Look ${i + 1}`, 22), {
      x: x + 0.18, y: cardY + 0.5, w: colW - 0.36, h: 0.6,
      fontSize: 16, fontFace: style.fonts.title, color: style.colors.ink, bold: true,
    });

    slide.addText(truncateText(p.theme || '', 120), {
      x: x + 0.18, y: cardY + 1.2, w: colW - 0.36, h: 3.2,
      fontSize: 12, fontFace: style.fonts.body, color: style.colors.sub, valign: 'top',
    });
  });

  // 4. 详细分镜
  const leftX = GRID.x;
  const leftW = GRID.leftW;
  const rightX = GRID.x + GRID.leftW + GRID.gap;
  const rightW = GRID.rightW;

  project.plans.forEach((p, idx) => {
    const lookName = p.themeTitle || p.outfitName || `Look ${idx + 1}`;
    const accentHex = getLookAccentHex(project, idx);

    // Look 总览
    slide = pres.addSlide();
    addBackground(slide, style);
    addAccentBar(slide, style.colors.accent || accentHex, 82);
    addFooterPageNumber(slide, pageNo++, style);
    addHeader(slide, `LOOK ${idx + 1}：${lookName}`, style, p.theme);

    addCard(slide, style, {
      x: leftX, y: GRID.contentTop, w: leftW, h: 1.05,
      label: 'CORE THEME', body: p.theme, bodyFontSize: 13,
    });

    addCard(slide, style, {
      x: leftX, y: GRID.contentTop + 1.25, w: leftW, h: 2.25,
      label: 'CREATIVE IDEA', body: p.creativeIdea, bodyFontSize: 13,
    });

    addCard(slide, style, {
      x: leftX, y: GRID.contentTop + 3.7, w: leftW, h: 1.65,
      label: 'COPYWRITING', body: p.copywriting, bodyFontSize: 14,
    });

    const collageImages = [0, 1, 2, 3].map((si) => opts?.images?.[idx * 100 + si]);
    addCollage2x2(slide, style, {
      x: rightX, y: GRID.contentTop, w: rightW, h: rightW,
      images: collageImages,
      labels: ['主场景', '叠搭A', '叠搭B', '纯色版面'],
      accentHex,
    });

    // 场景详情
    (p.scenes || []).forEach((s: ScenePlan, si: number) => {
      const label = sceneTypeLabel(s.type);
      const sceneKey = idx * 100 + si;

      slide = pres.addSlide();
      addBackground(slide, style);
      addAccentBar(slide, style.colors.accent || accentHex, 86);
      addFooterPageNumber(slide, pageNo++, style);
      addHeader(slide, `LOOK ${idx + 1} - ${label}`, style, s.location);

      addCard(slide, style, {
        x: leftX, y: GRID.contentTop, w: leftW, h: 2.35,
        label: 'SCENE DESCRIPTION', body: s.description, bodyFontSize: 13,
      });

      const shotsText = s.type === '纯色版面' && s.cutoutSpec
        ? `${s.shots}\n背景：${safe(s.cutoutSpec.background)}；打光：${safe(s.cutoutSpec.lighting)}；构图：${safe(s.cutoutSpec.framing)}`
        : s.shots;

      addCard(slide, style, {
        x: leftX, y: GRID.contentTop + 2.55, w: leftW, h: 2.2,
        label: 'SHOT SUGGESTIONS', body: shotsText, bullets: true, bodyFontSize: 13,
      });

      addFramedImage(slide, style, {
        x: rightX, y: GRID.imageY, w: rightW, h: GRID.imageH,
        imageDataUrl: opts?.images?.[sceneKey],
      });

      if (s.visualPrompt) {
        slide.addText(`Visual Prompt: ${truncateText(s.visualPrompt, 140)}`, {
          x: leftX, y: 7.18, w: 10.8, h: 0.25,
          fontSize: 8, fontFace: style.fonts.body, color: style.colors.light,
        });
      }
    });
  });

  const fileName = opts?.fileName || `${projectTitle}_拍摄预案.pptx`;
  await pres.writeFile({ fileName });
};
