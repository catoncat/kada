/**
 * 客户信息表单组件
 * 用于在项目详情页配置拍摄主体（客户）信息
 */

import { Users } from 'lucide-react';
import type { CustomerInfo, CustomerType, AgeRange } from '@/types/project';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from '@/components/ui/select';
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldDecrement,
  NumberFieldInput,
  NumberFieldIncrement,
} from '@/components/ui/number-field';

interface CustomerInfoFormProps {
  value?: CustomerInfo;
  onChange: (value: CustomerInfo | undefined) => void;
}

/** 客户类型选项 */
const CUSTOMER_TYPES: { value: CustomerType; label: string }[] = [
  { value: 'child', label: '儿童' },
  { value: 'pregnant', label: '孕妇' },
  { value: 'family', label: '家庭' },
  { value: 'parent_child', label: '亲子' },
  { value: 'couple', label: '情侣' },
  { value: 'individual', label: '个人' },
];

/** 年龄范围选项（儿童专用） */
const AGE_RANGES: { value: AgeRange; label: string }[] = [
  { value: 'infant', label: '婴儿(0-1岁)' },
  { value: 'toddler', label: '幼儿(1-3岁)' },
  { value: 'preschool', label: '学龄前(3-6岁)' },
  { value: 'school_age', label: '学龄(6-12岁)' },
  { value: 'teenager', label: '青少年(12-18岁)' },
];

export function CustomerInfoForm({ value, onChange }: CustomerInfoFormProps) {
  // 更新字段
  const updateField = <K extends keyof CustomerInfo>(
    field: K,
    fieldValue: CustomerInfo[K]
  ) => {
    const current = value || { type: 'individual' as CustomerType };
    onChange({ ...current, [field]: fieldValue });
  };

  // 是否显示年龄范围（仅儿童/亲子）
  const showAgeRange = value?.type === 'child' || value?.type === 'parent_child';

  // 是否显示人数（家庭/亲子/情侣）
  const showCount =
    value?.type === 'family' ||
    value?.type === 'parent_child' ||
    value?.type === 'couple';

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-[var(--ink-3)]" />
        <h3 className="text-lg font-medium text-[var(--ink)]">客户信息</h3>
      </div>

      <div className="grid gap-4">
        {/* 客户类型 */}
        <div className="grid gap-2">
          <Label>客户类型</Label>
          <Select
            value={value?.type || ''}
            onValueChange={(v) => updateField('type', v as CustomerType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择客户类型" />
            </SelectTrigger>
            <SelectPopup>
              {CUSTOMER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>

        {/* 年龄范围（条件显示） */}
        {showAgeRange && (
          <div className="grid gap-2">
            <Label>年龄范围</Label>
            <Select
              value={value?.ageRange || ''}
              onValueChange={(v) => updateField('ageRange', v as AgeRange)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择年龄范围" />
              </SelectTrigger>
              <SelectPopup>
                {AGE_RANGES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        )}

        {/* 人数（条件显示） */}
        {showCount && (
          <div className="grid gap-2">
            <Label>人数</Label>
            <NumberField
              value={value?.count ?? 2}
              onValueChange={(v) => updateField('count', v ?? undefined)}
              min={1}
              max={20}
            >
              <NumberFieldGroup className="w-32">
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldGroup>
            </NumberField>
          </div>
        )}

        {/* 关系描述 */}
        <div className="grid gap-2">
          <Label>关系描述</Label>
          <Input
            value={value?.relation || ''}
            onChange={(e) => updateField('relation', e.target.value || undefined)}
            placeholder="如：母女、一家四口、准爸妈"
          />
        </div>

        {/* 备注 */}
        <div className="grid gap-2">
          <Label>备注</Label>
          <Input
            value={value?.notes || ''}
            onChange={(e) => updateField('notes', e.target.value || undefined)}
            placeholder="特殊需求或注意事项"
          />
        </div>
      </div>
    </div>
  );
}
