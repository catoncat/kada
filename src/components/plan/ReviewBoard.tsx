import { useMemo, useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type {
  AcceptanceResult,
  GeneratedScene,
  SceneTaskTrack,
} from './types';
import { SceneAcceptanceCard } from './SceneAcceptanceCard';

type ReviewFilter = 'all' | 'fail' | 'unknown' | 'pass';

export function ReviewBoard({
  scenes,
  acceptanceMap,
  sceneTrackMap,
  manualPassedMap,
  onFixScene,
  onOpenEditScene,
  onViewSceneTask,
  onMarkScenePassed,
}: {
  scenes: GeneratedScene[];
  acceptanceMap: Map<number, AcceptanceResult>;
  sceneTrackMap: Map<number, SceneTaskTrack>;
  manualPassedMap: Map<number, boolean>;
  onFixScene: (sceneIndex: number) => void;
  onOpenEditScene: (sceneIndex: number) => void;
  onViewSceneTask: (sceneIndex: number) => void;
  onMarkScenePassed: (sceneIndex: number) => void;
}) {
  const [filter, setFilter] = useState<ReviewFilter>('all');

  const total = scenes.length;
  const accepted = scenes.filter((_, index) => manualPassedMap.get(index)).length;

  const filteredIndices = useMemo(() => {
    return scenes
      .map((_, index) => index)
      .filter((index) => {
        const acceptance = acceptanceMap.get(index);
        if (!acceptance) return filter === 'all';
        if (filter === 'all') return true;
        if (filter === 'fail') return acceptance.failCount > 0;
        if (filter === 'unknown') return acceptance.unknownCount > 0;
        return acceptance.overall === 'pass';
      });
  }, [acceptanceMap, filter, scenes]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">验收看板</h2>
            <p className="text-sm text-muted-foreground">
              通过率：{accepted}/{total}
            </p>
          </div>
          <SegmentedControl
            size="sm"
            value={filter}
            onValueChange={(next) => setFilter((next as ReviewFilter) || 'all')}
            options={[
              { value: 'all', label: '全部' },
              { value: 'fail', label: '未通过' },
              { value: 'unknown', label: '待补充' },
              { value: 'pass', label: '通过' },
            ]}
          />
        </div>
      </div>

      {filteredIndices.length === 0 ? (
        <Alert variant="info">
          <AlertTitle>没有匹配场景</AlertTitle>
          <AlertDescription>当前筛选条件下没有可展示的验收项。</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3">
          {filteredIndices.map((sceneIndex) => (
            <SceneAcceptanceCard
              key={`review-${sceneIndex}`}
              scene={scenes[sceneIndex]}
              sceneIndex={sceneIndex}
              acceptance={
                acceptanceMap.get(sceneIndex) || {
                  overall: 'unknown',
                  passCount: 0,
                  failCount: 0,
                  unknownCount: 5,
                  rules: [],
                }
              }
              track={sceneTrackMap.get(sceneIndex)}
              manuallyPassed={Boolean(manualPassedMap.get(sceneIndex))}
              onFix={onFixScene}
              onOpenEdit={onOpenEditScene}
              onViewTask={onViewSceneTask}
              onMarkPassed={onMarkScenePassed}
            />
          ))}
        </div>
      )}
    </div>
  );
}
