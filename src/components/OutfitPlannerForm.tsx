'use client';

import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import type {
  ClientProfile,
  Gender,
  LayeringTemplateKey,
  OutfitInput,
} from '@/types/project-plan';

const layeringTemplates: LayeringTemplateKey[] = [
  '外套叠穿',
  '帽子/发饰',
  '围巾/披肩',
  '鞋包替换',
  '层次细节（卷袖/塞衣角/腰带）',
  '道具加持（气球/花束/玩具/书本）',
  '发型变化（扎发/散发/半扎）',
  '动作变化（站/坐/走/跑/跳）',
  '机位变化（近景/半身/全身/俯拍/仰拍）',
];

function createOutfit(index: number): OutfitInput {
  return {
    id: `${Date.now()}_${index}`,
    name: `Look ${index + 1}`,
    color: '',
    styleTags: [],
    material: '',
    notes: '',
    layeringA: undefined,
    layeringB: undefined,
  };
}

export default function OutfitPlannerForm({
  client,
  onClientChange,
  outfits,
  onOutfitsChange,
}: {
  client: ClientProfile;
  onClientChange: (patch: Partial<ClientProfile>) => void;
  outfits: OutfitInput[];
  onOutfitsChange: (next: OutfitInput[]) => void;
}) {
  const maxed = outfits.length >= 3;

  const canGenerate = useMemo(() => {
    if (!client.age || client.age <= 0) return false;
    if (!outfits.length) return false;
    return outfits.every((o) => o.name.trim());
  }, [client.age, outfits]);

  const updateOutfit = (id: string, patch: Partial<OutfitInput>) => {
    onOutfitsChange(outfits.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const removeOutfit = (id: string) => {
    onOutfitsChange(outfits.filter((o) => o.id !== id));
  };

  return (
    <div className="rounded-[var(--radius-2xl)] border border-[var(--line)] bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ink)]">拍摄项目（3 套服装）</h3>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            输入客户信息与 3 套服装；每套将生成：主场景 + 2 个叠搭场景 + 纯色版面（抠图/版面）。
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1 rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--paper-2)] p-4">
          <div className="text-sm font-semibold text-[var(--ink)]">客户信息</div>

          <label className="mt-4 block text-xs font-medium text-[var(--ink-2)]">年龄（精确）</label>
          <input
            type="number"
            min={0}
            value={client.age ?? ''}
            onChange={(e) => onClientChange({ age: e.target.value ? Number(e.target.value) : null })}
            placeholder="例如：1"
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          />

          <label className="mt-4 block text-xs font-medium text-[var(--ink-2)]">性别</label>
          <select
            value={client.gender}
            onChange={(e) => onClientChange({ gender: e.target.value as Gender })}
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="男">男</option>
            <option value="女">女</option>
            <option value="不限">不限</option>
          </select>

          <label className="mt-4 block text-xs font-medium text-[var(--ink-2)]">用途（可选）</label>
          <select
            value={client.usage ?? ''}
            onChange={(e) => onClientChange({ usage: (e.target.value || undefined) as any })}
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="">不选择</option>
            <option value="电商">电商</option>
            <option value="种草">种草</option>
            <option value="品牌">品牌</option>
            <option value="留念">留念</option>
            <option value="其它">其它</option>
          </select>

          <div className="mt-5 text-xs text-[var(--ink-3)]">
            {canGenerate ? '可以生成。' : '请至少填写：年龄 + 每套服装名称。'}
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--ink)]">服装清单</div>
            <button
              type="button"
              disabled={maxed}
              onClick={() => onOutfitsChange([...outfits, createOutfit(outfits.length)])}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                maxed
                  ? 'border-[var(--line)] text-[var(--ink-3)] bg-white'
                  : 'border-[var(--line)] text-[var(--ink)] bg-white hover:bg-gray-50'
              }`}
            >
              <Plus className="w-4 h-4" />
              添加一套（最多 3 套）
            </button>
          </div>

          <div className="grid gap-4">
            {outfits.map((o, idx) => (
              <div key={o.id} className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--ink-3)]">第 {idx + 1} 套</div>
                    <input
                      value={o.name}
                      onChange={(e) => updateOutfit(o.id, { name: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                      placeholder="例如：Look 1 白色针织"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeOutfit(o.id)}
                    className="p-2 rounded-xl hover:bg-gray-50 text-[var(--ink-2)]"
                    title="删除该套"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-2)]">主色</label>
                    <input
                      value={o.color ?? ''}
                      onChange={(e) => updateOutfit(o.id, { color: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                      placeholder="白/蓝/红…"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-2)]">材质（可选）</label>
                    <input
                      value={o.material ?? ''}
                      onChange={(e) => updateOutfit(o.id, { material: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                      placeholder="针织/牛仔/丝绸…"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-2)]">风格标签（用逗号分隔）</label>
                    <input
                      value={o.styleTags.join('，')}
                      onChange={(e) =>
                        updateOutfit(o.id, {
                          styleTags: e.target.value
                            .split(/,|，/)
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .slice(0, 8),
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                      placeholder="甜/酷/学院/复古…"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-2)]">叠搭 A（模板）</label>
                    <select
                      value={o.layeringA ?? ''}
                      onChange={(e) => updateOutfit(o.id, { layeringA: (e.target.value || undefined) as any })}
                      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    >
                      <option value="">不选择</option>
                      {layeringTemplates.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-2)]">叠搭 B（模板）</label>
                    <select
                      value={o.layeringB ?? ''}
                      onChange={(e) => updateOutfit(o.id, { layeringB: (e.target.value || undefined) as any })}
                      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    >
                      <option value="">不选择</option>
                      {layeringTemplates.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-[var(--ink-2)]">备注（可选）</label>
                  <textarea
                    value={o.notes ?? ''}
                    onChange={(e) => updateOutfit(o.id, { notes: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                    placeholder="例如：优先室内窗光/需要露出帽子 logo/不要太运动…"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-[var(--ink-3)]">
        生成策略：每套服装 = 1 个主题；每个主题固定输出 4 个场景（主场景 + 叠搭 A + 叠搭 B + 纯色版面）。
      </div>
    </div>
  );
}
