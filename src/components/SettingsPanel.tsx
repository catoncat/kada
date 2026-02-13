'use client';

/**
 * 设置面板主入口
 * 支持两种模式：
 * 1. 对话框模式（默认）：点击触发按钮打开对话框
 * 2. 嵌入模式：直接嵌入页面渲染
 */

import { useState } from 'react';
import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { SettingsNav, type SettingsSection } from './settings/SettingsNav';
import { ProvidersSection } from './settings/ProvidersSection';
import { PromptTemplatesSection } from './settings/PromptTemplatesSection';
import { StorageManagement } from './settings/StorageManagement';

interface SettingsPanelProps {
  /** 嵌入模式：直接渲染内容而非对话框 */
  embedded?: boolean;
  /** 独立窗口模式：铺满窗口，无外框 */
  standalone?: boolean;
}

export default function SettingsPanel({ embedded = false, standalone = false }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('providers');

  // 渲染内容区域
  const renderContent = () => {
    switch (activeSection) {
      case 'providers':
        return <ProvidersSection />;
      case 'templates':
        return <PromptTemplatesSection />;
      case 'storage':
        return <StorageManagement />;
      default:
        return null;
    }
  };

  // 独立窗口 / 嵌入模式：直接渲染左右布局
  if (embedded || standalone) {
    return (
      <div className={standalone ? 'flex h-full' : 'overflow-hidden rounded-2xl border bg-card'}>
        <div className={standalone ? 'flex flex-1' : 'flex min-h-[500px]'}>
          {/* 左侧导航 */}
          <SettingsNav
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />

          {/* 右侧内容区 */}
          <div className="flex-1 p-6 overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </div>
    );
  }

  // 对话框模式（默认）
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* 触发按钮 */}
      <DialogTrigger
        className="fixed bottom-6 right-6 z-50 rounded-full border bg-card p-3 shadow-sm/5 transition hover:bg-accent/60"
        aria-label="打开设置"
      >
        <Settings className="h-6 w-6 text-muted-foreground" />
      </DialogTrigger>

      {/* 对话框内容 */}
      <DialogPopup
        className="w-full max-w-3xl max-h-[85vh] p-0 overflow-hidden"
        showCloseButton={true}
        bottomStickOnMobile={false}
      >
        {/* 标题栏 */}
        <div className="flex items-center border-b bg-popover px-6 py-4">
          <DialogTitle className="text-base font-semibold">设置</DialogTitle>
        </div>

        {/* 主体：左右布局 */}
        <div className="flex min-h-[500px] max-h-[calc(85vh-60px)]">
          {/* 左侧导航 */}
          <SettingsNav
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />

          {/* 右侧内容区 */}
          <div className="flex-1 p-6 overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
