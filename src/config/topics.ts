/**
 * Topics examples (editable)
 * - SettingsPanel JSON editor writes to localStorage
 * - TopicChips reads from localStorage with fallback
 */

export const TOPIC_EXAMPLES_STORAGE_KEY = 'shooting_topic_examples_v1';

export const defaultTopicExamples: string[] = [
  '巴洛克人像：单侧硬光、深阴影、油画皮肤质感',
  '新中式人像：宋锦纹理与现代廓形，留白构图',
  '雨夜街头人像：霓虹反光、伞面高光、颗粒胶片感',
  '暗房肖像：黑背景 + 轮廓光 + 烟雾层次（chiaroscuro）',
  '庭院人像：竹影斑驳、青苔石阶、低饱和色彩',
  '舞者人像：长曝光拖影、丝绸流动、强对比高光',
  '武侠气质人像：冷兵器质感、逆光尘埃、风起衣摆',
  '都市极简人像：建筑几何线条、硬朗阴影、冷暖撞色点缀',
];

export function validateTopicExamples(input: unknown):
  | { ok: true; examples: string[] }
  | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: '必须是字符串数组（Array<string>）' };
  }

  const normalized: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const v = input[i];
    if (typeof v !== 'string') {
      return { ok: false, error: `第 ${i + 1} 项必须是字符串` };
    }
    const s = v.trim();
    if (!s) {
      return { ok: false, error: `第 ${i + 1} 项不能为空字符串` };
    }
    if (!normalized.includes(s)) normalized.push(s);
  }

  // keep a sane upper bound
  return { ok: true, examples: normalized.slice(0, 16) };
}
