import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAppendScenePrompt, parseGeneratedSceneText } from './projects';

test('buildAppendScenePrompt includes existing scene summary and strict JSON instruction', () => {
  const prompt = buildAppendScenePrompt({
    projectTitle: '新春',
    projectPrompt: '红色新春主题',
    sceneName: '新春剪影',
    sceneDescription: '单色背景',
    sceneLighting: '舞台光',
    customerSummary: '爸爸，妈妈，宝宝',
    existingScenes: [
      {
        location: '中景',
        description: '三人互动',
        shots: '35mm',
        lighting: '主光柔和',
      },
    ],
  });

  assert.match(prompt, /已有分镜：/);
  assert.match(prompt, /输出要求（严格 JSON，不要 markdown）/);
  assert.match(prompt, /分镜 1/);
  assert.match(prompt, /visualPrompt/);
});

test('parseGeneratedSceneText parses json wrapped in markdown fence', () => {
  const parsed = parseGeneratedSceneText(`
\`\`\`json
{
  "location": "中央",
  "description": "妈妈抱着宝宝",
  "shots": "50mm",
  "lighting": "柔和",
  "visualPrompt": "母女在新春背景前微笑"
}
\`\`\`
`);

  assert.equal(parsed.location, '中央');
  assert.equal(parsed.visualPrompt, '母女在新春背景前微笑');
  assert.equal(parsed.selectedArtifactId, null);
});

test('parseGeneratedSceneText throws when visualPrompt is missing', () => {
  assert.throws(() => {
    parseGeneratedSceneText(`{"location":"中央"}`);
  }, /visualPrompt/);
});
