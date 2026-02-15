import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SceneCard } from '@/components/plan/SceneCard';
import type { GeneratedScene, SceneTaskTrack } from '@/components/plan/types';

const baseScene: GeneratedScene = {
  id: 'sc_demo',
  location: '场景中央',
  description: '三人互动',
  shots: '35mm',
  lighting: '柔光',
  visualPrompt: '一个家庭在新春背景前互动',
  sceneAssetImage: '/uploads/scene.jpg',
  selectedArtifactId: 'ga_2',
};

const idleTrack: SceneTaskTrack = {
  sceneIndex: 0,
  taskId: null,
  status: 'idle',
  createdAt: null,
  updatedAt: null,
  error: null,
};

describe('scene history selection', () => {
  it('calls onSelectHistoryArtifact with scene index and artifact id', () => {
    const onSelectHistoryArtifact = vi.fn();
    render(
      <SceneCard
        scene={baseScene}
        sceneIndex={0}
        taskTrack={idleTrack}
        historyArtifacts={[
          { id: 'ga_1', filePath: 'uploads/ga_1.png' },
          { id: 'ga_2', filePath: 'uploads/ga_2.png' },
        ]}
        selectedHistoryArtifactId="ga_2"
        onSelectHistoryArtifact={onSelectHistoryArtifact}
        canGenerateFromSelected
      />,
    );

    fireEvent.click(screen.getByLabelText('选择历史图 ga_1'));
    expect(onSelectHistoryArtifact).toHaveBeenCalledWith(0, 'ga_1');
  });

  it('enables generate-from-selected action when selected image exists', () => {
    const onGenerateFromSelected = vi.fn();
    render(
      <SceneCard
        scene={baseScene}
        sceneIndex={0}
        taskTrack={idleTrack}
        historyArtifacts={[
          { id: 'ga_2', filePath: 'uploads/ga_2.png' },
        ]}
        selectedHistoryArtifactId="ga_2"
        onGenerateFromSelected={onGenerateFromSelected}
        canGenerateFromSelected
      />,
    );

    const button = screen.getByRole('button', {
      name: '基于当前选中图生成',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(onGenerateFromSelected).toHaveBeenCalledWith(
      0,
      baseScene.visualPrompt,
    );
  });

  it('disables generate-from-selected action when no selected image', () => {
    const onGenerateFromSelected = vi.fn();
    render(
      <SceneCard
        scene={{ ...baseScene, selectedArtifactId: null }}
        sceneIndex={0}
        taskTrack={idleTrack}
        historyArtifacts={[]}
        selectedHistoryArtifactId={null}
        onGenerateFromSelected={onGenerateFromSelected}
        canGenerateFromSelected={false}
      />,
    );

    const button = screen.getByRole('button', {
      name: '基于当前选中图生成',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
