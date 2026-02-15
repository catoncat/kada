import Database from 'better-sqlite3';
import { streamSimple, type Model } from '@mariozechner/pi-ai';

const db = new Database('data/shooting-planner.db', { readonly: true });
const row = db
  .prepare('SELECT base_url, api_key, text_model FROM providers WHERE is_default = 1 LIMIT 1')
  .get() as { base_url: string; api_key: string; text_model: string } | undefined;

if (!row) {
  console.log('no default provider');
  process.exit(0);
}

const model: Model<'openai-completions'> = {
  id: row.text_model,
  name: row.text_model,
  api: 'openai-completions',
  provider: 'custom-openai',
  baseUrl: row.base_url,
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 8192,
};

const systemPrompt = [
  '你是摄影与营销协作 Agent。',
  '用户要求生图时，必须优先调用 photo_compose_prompt -> photo_enqueue_generation -> photo_get_generation_status，不能只做文字解释。',
  '用户要求文案时，优先调用 copy_generate_variants 或 copy_rewrite_by_tone。',
  '输出保持中文，并明确给出可追踪 ID。',
].join('\n');

const tools = [
  {
    name: 'photo_compose_prompt',
    description: '按资源与风格约束拼装照片生成提示词。',
    parameters: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        sceneContext: { type: 'string' },
      },
      required: ['intent'],
      additionalProperties: false,
    },
  },
  {
    name: 'photo_enqueue_generation',
    description: '创建图片生成任务并返回任务 ID。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'copy_generate_variants',
    description: '根据上下文生成多条文案候选。',
    parameters: {
      type: 'object',
      properties: {
        brief: { type: 'string' },
      },
      required: ['brief'],
      additionalProperties: false,
    },
  },
] as any;

const stream = streamSimple(
  model,
  {
    systemPrompt,
    tools,
    messages: [
      {
        role: 'user',
        timestamp: Date.now(),
        content: '找 3 个轻法式外景风格并生成首图，再给一版小红书文案',
      },
    ],
  },
  {
    apiKey: row.api_key,
    maxTokens: 1200,
    temperature: 0,
  },
);

let sawToolCall = false;
let text = '';
for await (const event of stream) {
  if (event.type === 'toolcall_end') {
    sawToolCall = true;
    console.log('TOOLCALL:', JSON.stringify(event.toolCall));
  }
  if (event.type === 'text_delta') {
    text += event.delta;
  }
  if (event.type === 'error') {
    console.log('ERROR:', event.error.errorMessage);
  }
  if (event.type === 'done') {
    console.log('DONE reason:', event.reason);
  }
}

console.log('sawToolCall=', sawToolCall);
console.log('textPreview=', text.slice(0, 260));
