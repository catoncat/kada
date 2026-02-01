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
import { TopicPromptsSection } from './settings/TopicPromptsSection';

interface SettingsPanelProps {
  /** 嵌入模式：直接渲染内容而非对话框 */
  embedded?: boolean;
}

export default function SettingsPanel({ embedded = false }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('providers');

  // 渲染内容区域
  const renderContent = () => {
    switch (activeSection) {
      case 'providers':
        return <ProvidersSection />;
      case 'topics':
        return <TopicPromptsSection />;
      default:
        return null;
    }
  };

  // 嵌入模式：直接渲染左右布局
  if (embedded) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white overflow-hidden">
        <div className="flex min-h-[500px]">
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
        className="fixed bottom-6 right-6 z-50 rounded-full border border-[var(--line)] bg-white p-3 shadow-sm hover:bg-gray-50 transition"
        aria-label="打开设置"
      >
        <Settings className="w-6 h-6 text-[var(--ink-2)]" />
      </DialogTrigger>

      {/* 对话框内容 */}
      <DialogPopup
        className="w-full max-w-3xl max-h-[85vh] p-0 overflow-hidden"
        showCloseButton={true}
        bottomStickOnMobile={false}
      >
        {/* 标题栏 */}
        <div className="flex items-center border-b border-[var(--line)] px-6 py-4 bg-white">
          <DialogTitle className="text-base font-semibold text-[var(--ink)]">
            设置
          </DialogTitle>
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
