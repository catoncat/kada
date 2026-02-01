/**
 * 客户信息表单组件
 * 支持自由添加拍摄人物，设置角色、性别、年龄
 */

import { useState } from 'react';
import { Users, Plus, X, ChevronDown } from 'lucide-react';
import type { CustomerInfo, Person, Gender } from '@/types/project';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/components/ui/menu';

interface CustomerInfoFormProps {
  value?: CustomerInfo;
  onChange: (value: CustomerInfo | undefined) => void;
}

/** 预设角色（带默认值） */
interface PresetRole {
  role: string;
  gender?: Gender;
  age?: number;
}

const PRESET_ROLES: PresetRole[] = [
  { role: '宝宝', age: 2 },
  { role: '妈妈', gender: 'female', age: 30 },
  { role: '爸爸', gender: 'male', age: 32 },
  { role: '姐姐', gender: 'female', age: 8 },
  { role: '哥哥', gender: 'male', age: 10 },
  { role: '弟弟', gender: 'male', age: 4 },
  { role: '妹妹', gender: 'female', age: 3 },
  { role: '爷爷', gender: 'male', age: 60 },
  { role: '奶奶', gender: 'female', age: 58 },
  { role: '外公', gender: 'male', age: 62 },
  { role: '外婆', gender: 'female', age: 60 },
];

/** 家庭组合预设 */
interface FamilyPreset {
  label: string;
  people: PresetRole[];
}

const FAMILY_PRESETS: FamilyPreset[] = [
  {
    label: '一家三口',
    people: [
      { role: '爸爸', gender: 'male', age: 32 },
      { role: '妈妈', gender: 'female', age: 30 },
      { role: '宝宝', age: 3 },
    ],
  },
  {
    label: '一家四口',
    people: [
      { role: '爸爸', gender: 'male', age: 35 },
      { role: '妈妈', gender: 'female', age: 33 },
      { role: '姐姐', gender: 'female', age: 6 },
      { role: '弟弟', gender: 'male', age: 3 },
    ],
  },
  {
    label: '三代同堂',
    people: [
      { role: '爷爷', gender: 'male', age: 60 },
      { role: '奶奶', gender: 'female', age: 58 },
      { role: '爸爸', gender: 'male', age: 35 },
      { role: '妈妈', gender: 'female', age: 33 },
      { role: '宝宝', age: 3 },
    ],
  },
];

/** 性别选项 */
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
];

export function CustomerInfoForm({ value, onChange }: CustomerInfoFormProps) {
  const [newRole, setNewRole] = useState('');

  const people = value?.people || [];

  // 添加单个人物
  const addPerson = (preset: PresetRole) => {
    const newPerson: Person = {
      id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: preset.role,
      gender: preset.gender,
      age: preset.age,
    };

    onChange({
      people: [...people, newPerson],
      notes: value?.notes,
    });
  };

  // 添加自定义角色
  const addCustomRole = () => {
    if (!newRole.trim()) return;
    addPerson({ role: newRole.trim() });
    setNewRole('');
  };

  // 批量添加家庭组合
  const addFamilyPreset = (preset: FamilyPreset) => {
    const newPeople: Person[] = preset.people.map((p, i) => ({
      id: `person-${Date.now()}-${i}`,
      role: p.role,
      gender: p.gender,
      age: p.age,
    }));

    onChange({
      people: [...people, ...newPeople],
      notes: value?.notes,
    });
  };

  // 更新人物
  const updatePerson = (id: string, updates: Partial<Person>) => {
    onChange({
      people: people.map(p => p.id === id ? { ...p, ...updates } : p),
      notes: value?.notes,
    });
  };

  // 删除人物
  const removePerson = (id: string) => {
    onChange({
      people: people.filter(p => p.id !== id),
      notes: value?.notes,
    });
  };

  // 更新备注
  const updateNotes = (notes: string) => {
    onChange({
      people,
      notes: notes || undefined,
    });
  };

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-6">
      {/* 标题栏 + 添加按钮 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--ink-3)]" />
          <h3 className="text-lg font-medium text-[var(--ink)]">拍摄人物</h3>
          {people.length > 0 && (
            <span className="text-sm text-[var(--ink-3)]">({people.length}人)</span>
          )}
        </div>

        {/* 添加下拉菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
          >
            <Plus className="w-4 h-4 mr-1" />
            添加
            <ChevronDown className="w-3 h-3 ml-1" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* 家庭组合 */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-[var(--ink-3)]">
                家庭组合
              </DropdownMenuLabel>
              {FAMILY_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.label}
                  onClick={() => addFamilyPreset(preset)}
                >
                  {preset.label}
                  <span className="ml-auto text-xs text-[var(--ink-3)]">
                    {preset.people.length}人
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/* 单个角色 */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-[var(--ink-3)]">
                单个角色
              </DropdownMenuLabel>
              {PRESET_ROLES.slice(0, 5).map((preset) => (
                <DropdownMenuItem
                  key={preset.role}
                  onClick={() => addPerson(preset)}
                >
                  {preset.role}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {PRESET_ROLES.slice(5).map((preset) => (
                <DropdownMenuItem
                  key={preset.role}
                  onClick={() => addPerson(preset)}
                >
                  {preset.role}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-4">
        {/* 已添加的人物列表 */}
        {people.length > 0 ? (
          <div className="space-y-2">
            {people.map((person) => (
              <div
                key={person.id}
                className="flex items-center gap-2 p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)]"
              >
                {/* 角色名 */}
                <Input
                  value={person.role}
                  onChange={(e) => updatePerson(person.id, { role: e.target.value })}
                  className="w-20 flex-shrink-0"
                  placeholder="角色"
                />

                {/* 性别切换按钮 */}
                <div className="flex rounded-lg border border-[var(--line)] overflow-hidden">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => updatePerson(person.id, { gender: g.value })}
                      className={`px-3 py-1.5 text-sm transition ${
                        person.gender === g.value
                          ? 'bg-primary text-white'
                          : 'bg-white text-[var(--ink-2)] hover:bg-gray-50'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* 年龄输入 */}
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={person.age ?? ''}
                    onChange={(e) => updatePerson(person.id, {
                      age: e.target.value ? parseInt(e.target.value) : undefined
                    })}
                    className="w-16 text-center"
                    placeholder="年龄"
                    min={0}
                    max={120}
                  />
                  <span className="text-sm text-[var(--ink-3)]">岁</span>
                </div>

                {/* 删除按钮 */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removePerson(person.id)}
                  className="ml-auto flex-shrink-0 text-[var(--ink-3)] hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-[var(--ink-3)]">
            点击右上角「添加」按钮添加拍摄人物
          </div>
        )}

        {/* 自定义添加 */}
        <div className="flex gap-2">
          <Input
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomRole()}
            placeholder="输入其他角色，如：闺蜜、新郎、孕妇..."
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={addCustomRole}
            disabled={!newRole.trim()}
          >
            添加
          </Button>
        </div>

        {/* 备注 */}
        {people.length > 0 && (
          <div className="grid gap-2 pt-2 border-t border-[var(--line)]">
            <Label className="text-sm text-[var(--ink-2)]">备注（可选）</Label>
            <Input
              value={value?.notes || ''}
              onChange={(e) => updateNotes(e.target.value)}
              placeholder="补充说明，如：双胞胎、孕妇写真、毕业照..."
            />
          </div>
        )}
      </div>
    </div>
  );
}
