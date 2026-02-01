/**
 * 工作室配置区域
 * 设置业务类型、目标客户群、拍摄风格和自定义 Prompt 前缀
 */

'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { getSetting, setSetting } from '@/lib/settings-api';
import type { StudioProfile, BusinessType } from '@/types/settings';
import { SETTINGS_KEYS } from '@/types/settings';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from '@/components/ui/select';

/** 业务类型选项 */
const BUSINESS_TYPES: { value: BusinessType; label: string; desc: string }[] = [
  {
    value: 'consumer_studio',
    label: '消费级影楼',
    desc: '服务儿童、孕妇、家庭等消费者',
  },
  {
    value: 'commercial',
    label: '商业摄影',
    desc: '服务企业、品牌、产品等商业客户',
  },
  {
    value: 'artistic',
    label: '艺术摄影',
    desc: '个人艺术创作、展览作品',
  },
];

/** 预设目标客户群（消费级影楼） */
const PRESET_CUSTOMERS = ['儿童', '孕妇', '亲子', '家庭', '情侣', '个人写真'];

export function StudioProfileSection() {
  const [profile, setProfile] = useState<StudioProfile>({
    businessType: 'consumer_studio',
    targetCustomers: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 加载配置
  useEffect(() => {
    async function load() {
      try {
        const data = await getSetting<StudioProfile>(SETTINGS_KEYS.STUDIO_PROFILE);
        if (data) {
          setProfile(data);
        }
      } catch {
        // 忽略错误，使用默认值
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // 更新字段
  const updateField = <K extends keyof StudioProfile>(
    field: K,
    value: StudioProfile[K]
  ) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // 切换目标客户
  const toggleCustomer = (customer: string) => {
    const current = profile.targetCustomers || [];
    const next = current.includes(customer)
      ? current.filter((c) => c !== customer)
      : [...current, customer];
    updateField('targetCustomers', next);
  };

  // 保存配置
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setSetting(SETTINGS_KEYS.STUDIO_PROFILE, profile);
      setHasChanges(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-3)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">工作室配置</h2>
        <p className="text-sm text-[var(--ink-2)]">
          配置工作室定位，影响 AI 生成预案的风格和内容
        </p>
      </div>

      {/* 业务类型 */}
      <div className="grid gap-2">
        <Label>业务类型</Label>
        <Select
          value={profile.businessType}
          onValueChange={(v) => updateField('businessType', v as BusinessType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {BUSINESS_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <p className="text-xs text-[var(--ink-3)]">
          {BUSINESS_TYPES.find((t) => t.value === profile.businessType)?.desc}
        </p>
      </div>

      {/* 目标客户群（仅消费级影楼） */}
      {profile.businessType === 'consumer_studio' && (
        <div className="grid gap-2">
          <Label>目标客户群</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_CUSTOMERS.map((customer) => {
              const isSelected = profile.targetCustomers?.includes(customer);
              return (
                <button
                  key={customer}
                  type="button"
                  onClick={() => toggleCustomer(customer)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                    isSelected
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-[var(--ink-2)] border-[var(--line)] hover:border-gray-400'
                  }`}
                >
                  {customer}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--ink-3)]">
            选择工作室主要服务的客户类型，用于生成更贴合的预案
          </p>
        </div>
      )}

      {/* 拍摄风格 */}
      <div className="grid gap-2">
        <Label>拍摄风格描述</Label>
        <Input
          value={profile.shootingStyle || ''}
          onChange={(e) => updateField('shootingStyle', e.target.value || undefined)}
          placeholder="如：清新自然、韩式简约、复古文艺"
        />
        <p className="text-xs text-[var(--ink-3)]">
          简要描述工作室的整体拍摄风格
        </p>
      </div>

      {/* 自定义 Prompt 前缀 */}
      <div className="grid gap-2">
        <Label>自定义 Prompt 前缀</Label>
        <Textarea
          value={profile.promptPrefix || ''}
          onChange={(e) => updateField('promptPrefix', e.target.value || undefined)}
          placeholder="这里的内容会添加到每次生成的提示词开头，可用于补充工作室特色要求"
          className="min-h-24"
        />
        <p className="text-xs text-[var(--ink-3)]">
          可选。例如：「我们的特色是捕捉自然真实的瞬间，避免过度摆拍」
        </p>
      </div>

      {/* 保存按钮 */}
      <div className="pt-2">
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isSaving ? '保存中...' : '保存配置'}
        </Button>
      </div>
    </div>
  );
}
