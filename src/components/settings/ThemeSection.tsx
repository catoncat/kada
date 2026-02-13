'use client';

import { Loader2, MonitorCog, MoonStar, Plus, Sun, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  applyDockIconForCurrentTheme,
  canApplyRuntimeDockIcon,
  createCustomIconId,
  getDefaultDockIconConfig,
  loadDockIconConfig,
  saveDockIconConfig,
  type CustomDockIcon,
  type DockIconConfig,
  type PresetId,
} from '@/lib/dock-icon';
import {
  getThemePreference,
  resolveTheme,
  setThemePreference,
  type ThemePreference,
} from '@/lib/theme';
import { cn } from '@/lib/utils';

interface PresetOption {
  id: PresetId;
  name: string;
  lightPreview: string;
  darkPreview: string;
}

interface NewIconDraft {
  name: string;
  lightIconPath: string;
  darkIconPath: string;
}

interface ThemeOption {
  id: ThemePreference;
  label: string;
}

const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'kada-core',
    name: 'Core',
    darkPreview: '/app-icon-presets/kada-core-dark.png',
    lightPreview: '/app-icon-presets/kada-core-light.png',
  },
  {
    id: 'kada-knot',
    name: 'Knot',
    darkPreview: '/app-icon-presets/kada-knot-dark.png',
    lightPreview: '/app-icon-presets/kada-knot-light.png',
  },
  {
    id: 'kada-mark',
    name: 'Mark',
    darkPreview: '/app-icon-presets/kada-mark-dark.png',
    lightPreview: '/app-icon-presets/kada-mark-light.png',
  },
];

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '亮色' },
  { id: 'dark', label: '暗色' },
];

const EMPTY_NEW_ICON: NewIconDraft = {
  name: '',
  lightIconPath: '',
  darkIconPath: '',
};

function getCurrentMode(preference: ThemePreference): 'light' | 'dark' {
  return resolveTheme(preference);
}

function toSelectedIconIdForPreset(presetId: PresetId) {
  return `preset:${presetId}`;
}

function toSelectedIconIdForCustom(customId: string) {
  return `custom:${customId}`;
}

export function ThemeSection() {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [config, setConfig] = useState<DockIconConfig>(getDefaultDockIconConfig());
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIcon, setNewIcon] = useState<NewIconDraft>(EMPTY_NEW_ICON);
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const canApplyDockIcon = canApplyRuntimeDockIcon();
  const currentMode = useMemo(() => getCurrentMode(themePreference), [themePreference]);

  useEffect(() => {
    async function init() {
      try {
        setThemePreferenceState(getThemePreference());
        const loaded = await loadDockIconConfig();
        setConfig(loaded);
      } finally {
        setIsLoading(false);
      }
    }

    void init();
  }, []);

  const persistConfig = async (next: DockIconConfig) => {
    setIsSaving(true);
    try {
      await saveDockIconConfig(next);
    } finally {
      setIsSaving(false);
    }
  };

  const applyCurrentIcon = async (nextConfig?: DockIconConfig) => {
    if (!canApplyDockIcon) {
      setStatus({
        type: 'error',
        message: '仅支持 macOS + Tauri 运行态',
      });
      return;
    }

    setIsApplying(true);
    try {
      await applyDockIconForCurrentTheme(nextConfig);
      setStatus({ type: 'success', message: `已应用${currentMode === 'dark' ? '暗色' : '亮色'}图标` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ type: 'error', message: `应用失败：${message}` });
    } finally {
      setIsApplying(false);
    }
  };

  const handleThemeChange = async (nextPreference: ThemePreference) => {
    setStatus(null);
    setThemePreferenceState(nextPreference);
    setThemePreference(nextPreference);
    if (canApplyDockIcon) {
      await applyCurrentIcon();
    }
  };

  const handleSelectPreset = async (presetId: PresetId) => {
    setStatus(null);
    const next: DockIconConfig = {
      ...config,
      selectedIconId: toSelectedIconIdForPreset(presetId),
    };
    setConfig(next);
    await persistConfig(next);
    if (canApplyDockIcon) {
      await applyCurrentIcon(next);
    }
  };

  const handleSelectCustom = async (customId: string) => {
    setStatus(null);
    const next: DockIconConfig = {
      ...config,
      selectedIconId: toSelectedIconIdForCustom(customId),
    };
    setConfig(next);
    await persistConfig(next);
    if (canApplyDockIcon) {
      await applyCurrentIcon(next);
    }
  };

  const handleAddCustomIcon = async () => {
    setStatus(null);
    const name = newIcon.name.trim();
    const lightIconPath = newIcon.lightIconPath.trim();
    const darkIconPath = newIcon.darkIconPath.trim();

    if (!name || !lightIconPath || !darkIconPath) {
      setStatus({ type: 'error', message: '请填写完整信息' });
      return;
    }

    const customIcon: CustomDockIcon = {
      id: createCustomIconId(),
      name,
      lightIconPath,
      darkIconPath,
    };

    const next: DockIconConfig = {
      customIcons: [...config.customIcons, customIcon],
      selectedIconId: toSelectedIconIdForCustom(customIcon.id),
    };

    setConfig(next);
    setNewIcon(EMPTY_NEW_ICON);
    setShowAddForm(false);
    await persistConfig(next);

    if (canApplyDockIcon) {
      await applyCurrentIcon(next);
    } else {
      setStatus({ type: 'success', message: '已新增图标' });
    }
  };

  const handleRemoveCustomIcon = async (customId: string) => {
    setStatus(null);
    const remaining = config.customIcons.filter((item) => item.id !== customId);
    const removedIsSelected = config.selectedIconId === toSelectedIconIdForCustom(customId);
    const next: DockIconConfig = {
      customIcons: remaining,
      selectedIconId: removedIsSelected ? toSelectedIconIdForPreset('kada-mark') : config.selectedIconId,
    };

    setConfig(next);
    await persistConfig(next);

    if (canApplyDockIcon && removedIsSelected) {
      await applyCurrentIcon(next);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">主题</h2>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">App 主题</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((option) => {
            const selected = themePreference === option.id;
            return (
              <Button
                key={option.id}
                size="sm"
                variant={selected ? 'default' : 'outline'}
                onClick={() => void handleThemeChange(option.id)}
                className="justify-center"
                disabled={isApplying}
              >
                {option.id === 'light' && <Sun className="size-4" />}
                {option.id === 'dark' && <MoonStar className="size-4" />}
                {option.id === 'system' && <MonitorCog className="size-4" />}
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">图标</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            <Plus className="size-4" />
            新增
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {PRESET_OPTIONS.map((preset) => {
            const selected = config.selectedIconId === toSelectedIconIdForPreset(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => void handleSelectPreset(preset.id)}
                className={cn(
                  'rounded-lg border p-3 text-left transition',
                  selected
                    ? 'border-primary bg-primary/8'
                    : 'border-border hover:border-primary/40 hover:bg-muted/20',
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{preset.name}</span>
                  {selected && <span className="size-2 rounded-full bg-primary" />}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border bg-muted/30 p-1">
                    <img
                      src={preset.lightPreview}
                      alt={`${preset.name} light`}
                      className="h-14 w-14 rounded object-cover"
                    />
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-1">
                    <img
                      src={preset.darkPreview}
                      alt={`${preset.name} dark`}
                      className="h-14 w-14 rounded object-cover"
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {config.customIcons.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">自定义</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {config.customIcons.map((item) => {
                const selected = config.selectedIconId === toSelectedIconIdForCustom(item.id);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-lg border p-3',
                      selected ? 'border-primary bg-primary/6' : 'border-border',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => void handleSelectCustom(item.id)}
                      >
                        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.lightIconPath}</p>
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRemoveCustomIcon(item.id)}
                        aria-label={`删除 ${item.name}`}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showAddForm && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-icon-name">名称</Label>
              <Input
                id="new-icon-name"
                value={newIcon.name}
                onChange={(event) =>
                  setNewIcon((prev) => ({ ...prev, name: event.currentTarget.value }))
                }
                placeholder="例如：我的图标"
                size="sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-icon-light">亮色路径</Label>
              <Input
                id="new-icon-light"
                value={newIcon.lightIconPath}
                onChange={(event) =>
                  setNewIcon((prev) => ({ ...prev, lightIconPath: event.currentTarget.value }))
                }
                placeholder="/Users/you/.../light.png"
                size="sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-icon-dark">暗色路径</Label>
              <Input
                id="new-icon-dark"
                value={newIcon.darkIconPath}
                onChange={(event) =>
                  setNewIcon((prev) => ({ ...prev, darkIconPath: event.currentTarget.value }))
                }
                placeholder="/Users/you/.../dark.png"
                size="sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void handleAddCustomIcon()} disabled={isSaving}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                添加
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setNewIcon(EMPTY_NEW_ICON);
                }}
              >
                取消
              </Button>
            </div>
          </div>
        )}

      </div>

      {status && (
        <Alert variant={status.type === 'success' ? 'success' : 'error'}>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
