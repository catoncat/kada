import type { ClientProfile, OutfitInput, GlobalStyle } from '@/types/project-plan';

function normalizeOutfit(o: OutfitInput) {
  return {
    id: o.id,
    name: o.name,
    color: o.color || '',
    styleTags: o.styleTags || [],
    material: o.material || '',
    notes: o.notes || '',
    layeringA: o.layeringA || '',
    layeringB: o.layeringB || '',
  };
}

export function buildProjectPrompt({
  client,
  outfits,
  globalStyle,
}: {
  client: ClientProfile;
  outfits: OutfitInput[];
  globalStyle?: GlobalStyle;
}): string {
  const clientText = {
    age: client.age,
    gender: client.gender,
    usage: client.usage || '',
  };

  const outfitsText = outfits.map(normalizeOutfit);

  // 构建全局风格描述
  const styleKeywords: string[] = [];
  if (globalStyle) {
    // Color tone mapping
    const colorToneMap = {
      warm: 'warm color palette, golden tones, amber lighting',
      cool: 'cool color palette, blue tones, crisp lighting',
      neutral: 'neutral color palette, balanced tones, natural colors',
    };
    styleKeywords.push(colorToneMap[globalStyle.colorTone]);

    // Lighting mood mapping
    const lightingMoodMap = {
      soft: 'soft lighting, gentle shadows, diffused light',
      dramatic: 'dramatic lighting, strong contrast, deep shadows',
      natural: 'natural lighting, even illumination, organic shadows',
    };
    styleKeywords.push(lightingMoodMap[globalStyle.lightingMood]);

    // Era mapping
    const eraMap = {
      modern: 'modern aesthetic, contemporary style, clean look',
      vintage: 'vintage aesthetic, retro style, nostalgic feel',
      timeless: 'timeless aesthetic, classic style, enduring appeal',
    };
    styleKeywords.push(eraMap[globalStyle.era]);
  }

  const styleInstruction = globalStyle
    ? `\n\n**全局风格锚点（必须严格遵守）：**\n每一个 visualPrompt 都必须包含以下风格关键词：\n- 色调：${globalStyle.colorTone === 'warm' ? '暖色调（warm tones）' : globalStyle.colorTone === 'cool' ? '冷色调（cool tones）' : '中性色调（neutral tones）'}\n- 光线氛围：${globalStyle.lightingMood === 'soft' ? '柔光（soft lighting）' : globalStyle.lightingMood === 'dramatic' ? '戏剧性光线（dramatic lighting）' : '自然光（natural lighting）'}\n- 时代感：${globalStyle.era === 'modern' ? '现代（modern）' : globalStyle.era === 'vintage' ? '复古（vintage）' : '永恒（timeless）'}\n\n所有场景的 visualPrompt 都必须包含这些风格关键词：${styleKeywords.join(', ')}\n这样可以保证所有生成的图片风格统一、调性一致。`
    : '';

  const schema = `{
    "title": "项目标题（简短）",
    "client": { "age": 1, "gender": "男|女|不限", "usage": "电商|种草|品牌|留念|其它|" },
    "outfits": [ { "id": "...", "name": "...", "color": "", "styleTags": [""], "material": "", "notes": "", "layeringA": "", "layeringB": "" } ],
    "plans": [
      {
        "outfitId": "对应 outfits.id",
        "outfitName": "对应 outfits.name",
        "themeTitle": "这一套的主题名（短）",
        "theme": "核心主题（短句）",
        "creativeIdea": "具体创意思路（中文）",
        "copywriting": "核心文案（中文）",
        "scenes": [
          {
            "type": "主场景|叠搭A|叠搭B|纯色版面",
            "location": "场景名称",
            "description": "中文描述",
            "shots": "中文镜头建议",
            "visualPrompt": "English stable diffusion prompt (lighting/mood/camera angle/keywords)",
            "cutoutSpec": { "background": "纯色背景描述", "lighting": "打光建议", "framing": "构图留白" }
          }
        ]
      }
    ]
  }`;

  return `你是一位资深摄影师、创意导演。

现在要为「三套服装项目」生成完整拍摄预案。要求：
1) 输出必须是严格 JSON（不要 markdown、不要注释、不要多余文字）。
2) 所有中文字段必须中文；仅 visualPrompt 必须英文（稳定扩散/写实摄影风格）。
3) 一共生成 ${outfits.length} 套（最多 3 套）；每套必须固定输出 4 个 scenes，顺序固定：主场景、叠搭A、叠搭B、纯色版面。
4) 叠搭A / 叠搭B 要围绕 outfits 里给定的 layeringA/layeringB 模板来做变化（例如：外套叠穿、道具加持等）。
5) 纯色版面必须给出 cutoutSpec（background/lighting/framing），并在描述中体现"方便抠图/版面排版"。
6) 每套的主场景要更"主视觉/电影感/高完成度"。${styleInstruction}

客户信息：${JSON.stringify(clientText)}
服装输入：${JSON.stringify(outfitsText)}

请输出 JSON，结构必须严格匹配以下 schema（字段名一致）：
${schema}
`;
}
