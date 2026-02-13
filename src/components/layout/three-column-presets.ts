import type { ThreeColumnWidthPreset } from '@/components/layout/ThreeColumnLayout';

export const THREE_COLUMN_PRESETS = {
  assetsModels: {
    storageKey: 'spv2:assets-model-list-width',
    legacyStorageKeys: ['spv2:assets-resource-list-width'],
    defaultWidth: 300,
    minWidth: 260,
    maxWidth: 360,
  },
  assetsScenes: {
    storageKey: 'spv2:assets-scene-list-width',
    legacyStorageKeys: ['spv2:assets-resource-list-width'],
    defaultWidth: 300,
    minWidth: 260,
    maxWidth: 360,
  },
  projectScenes: {
    storageKey: 'spv2:project-scene-list-width',
    defaultWidth: 320,
    minWidth: 280,
    maxWidth: 420,
  },
  projects: {
    storageKey: 'spv2:projects-sidebar-width',
    defaultWidth: 280,
    minWidth: 240,
    maxWidth: 420,
  },
} satisfies Record<string, ThreeColumnWidthPreset>;

