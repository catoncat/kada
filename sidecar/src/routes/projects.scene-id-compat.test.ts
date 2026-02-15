import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSceneSlotCandidates } from './projects';
import { ensureGeneratedPlanScenes } from '../worker/handlers/plan-generation';

test('resolveSceneSlotCandidates returns sceneId and index slots in priority order', () => {
  const slots = resolveSceneSlotCandidates({ id: 'sc_demo' }, 3);
  assert.deepEqual(slots, ['scene:sc_demo', 'scene:3']);
});

test('resolveSceneSlotCandidates falls back to legacy index slot when sceneId is missing', () => {
  const slots = resolveSceneSlotCandidates({}, 1);
  assert.deepEqual(slots, ['scene:1']);
});

test('ensureGeneratedPlanScenes backfills missing sceneId and selectedArtifactId', () => {
  const { plan, changed } = ensureGeneratedPlanScenes({
    title: 't',
    theme: 'th',
    creativeIdea: 'idea',
    copywriting: 'copy',
    scenes: [
      {
        location: 'loc',
        description: 'desc',
        shots: 'shots',
        lighting: 'light',
        visualPrompt: 'prompt',
      },
    ],
  });

  assert.equal(changed, true);
  assert.equal(typeof plan.scenes[0].id, 'string');
  assert.equal(Boolean(plan.scenes[0].id), true);
  assert.equal(plan.scenes[0].selectedArtifactId, null);
});
