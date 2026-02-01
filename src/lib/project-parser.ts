import type { ProjectPlan, OutfitPlan, ScenePlan } from '@/types/project-plan';

function safeString(v: any, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function normalizeProjectPlan(raw: any): ProjectPlan {
  const id = safeString(raw?.id, Date.now().toString());
  const createdAt = typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now();

  const client = {
    age: typeof raw?.client?.age === 'number' ? raw.client.age : null,
    gender: raw?.client?.gender === '男' || raw?.client?.gender === '女' || raw?.client?.gender === '不限' ? raw.client.gender : '不限',
    usage: raw?.client?.usage,
  };

  const outfits = safeArray<any>(raw?.outfits).map((o) => ({
    id: safeString(o?.id, `${Date.now()}_${Math.random()}`),
    name: safeString(o?.name, '未命名'),
    color: safeString(o?.color, ''),
    styleTags: safeArray<string>(o?.styleTags).map((s) => safeString(s)).filter(Boolean),
    material: safeString(o?.material, ''),
    notes: safeString(o?.notes, ''),
    layeringA: o?.layeringA,
    layeringB: o?.layeringB,
  }));

  const plans: OutfitPlan[] = safeArray<any>(raw?.plans).map((p) => {
    const scenes: ScenePlan[] = safeArray<any>(p?.scenes).map((s) => ({
      type: s?.type,
      location: safeString(s?.location, ''),
      description: safeString(s?.description, ''),
      shots: safeString(s?.shots, ''),
      proParams: s?.proParams
        ? {
            focalLengthMm:
              s.proParams.focalLengthMm === 24 ||
              s.proParams.focalLengthMm === 35 ||
              s.proParams.focalLengthMm === 50 ||
              s.proParams.focalLengthMm === 85 ||
              s.proParams.focalLengthMm === 135
                ? s.proParams.focalLengthMm
                : undefined,
            lightRatio: s.proParams.lightRatio === '2:1' || s.proParams.lightRatio === '4:1' || s.proParams.lightRatio === '8:1' ? s.proParams.lightRatio : undefined,
            timeOfDay:
              s.proParams.timeOfDay === '黄金时段' ||
              s.proParams.timeOfDay === '蓝调时刻' ||
              s.proParams.timeOfDay === '正午硬光' ||
              s.proParams.timeOfDay === '阴天柔光'
                ? s.proParams.timeOfDay
                : undefined,
            exposureStyle:
              s.proParams.exposureStyle === '高调' || s.proParams.exposureStyle === '低调' || s.proParams.exposureStyle === '正常' ? s.proParams.exposureStyle : undefined,
            notes: safeString(s.proParams.notes, ''),
          }
        : undefined,
      visualPrompt: safeString(s?.visualPrompt, ''),
      cutoutSpec: s?.cutoutSpec
        ? {
            background: safeString(s.cutoutSpec.background, ''),
            lighting: safeString(s.cutoutSpec.lighting, ''),
            framing: safeString(s.cutoutSpec.framing, ''),
          }
        : undefined,
    }));

    return {
      outfitId: safeString(p?.outfitId, ''),
      outfitName: safeString(p?.outfitName, ''),
      themeTitle: safeString(p?.themeTitle, ''),
      theme: safeString(p?.theme, ''),
      creativeIdea: safeString(p?.creativeIdea, ''),
      copywriting: safeString(p?.copywriting, ''),
      scenes,
    };
  });

  return { id, createdAt, client, outfits, plans };
}
