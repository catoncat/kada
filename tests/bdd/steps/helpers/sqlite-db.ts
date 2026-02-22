import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

function sqliteEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function quote(value: string): string {
  return `'${sqliteEscape(value)}'`;
}

function bddDbPath(): string {
  return path.join(process.cwd(), '.tmp', 'bdd-data', 'shooting-planner.db');
}

export function runSql(sql: string): void {
  const payload = `PRAGMA busy_timeout=3000; ${sql}`;
  execFileSync('sqlite3', [bddDbPath(), payload], {
    stdio: 'pipe',
  });
}

export function seedLocalReplayProvider(): string {
  const providerId = `prov_${randomUUID()}`;
  const name = `bdd-local-${Date.now()}`;

  runSql(`
INSERT INTO providers (
  id, name, format, routing_profile, base_url, api_key,
  text_model, image_model, is_default, is_builtin, created_at, updated_at
) VALUES (
  ${quote(providerId)},
  ${quote(name)},
  'local',
  'native',
  'http://localhost/local',
  '',
  'bdd-text-model',
  'bdd-image-model',
  0,
  0,
  unixepoch(),
  unixepoch()
);
`);

  return providerId;
}

export function markTaskFailed(taskId: string, message: string): void {
  runSql(`
UPDATE tasks
SET status='failed', error=${quote(message)}, output=NULL, updated_at=unixepoch()
WHERE id=${quote(taskId)};
`);
}

export function seedImageArtifact(input: {
  ownerId: string;
  ownerSlot?: string;
  prompt?: string;
}): { artifactId: string; runId: string } {
  const artifactId = `ga_${randomUUID()}`;
  const runId = `gr_${randomUUID()}`;

  const ownerSlot = input.ownerSlot || 'scene:0';
  const prompt = input.prompt || 'bdd image artifact';
  const filePath = `uploads/bdd-${Date.now()}.png`;

  runSql(`
INSERT INTO generation_runs (
  id, kind, trigger, status, related_type, related_id,
  effective_prompt, created_at, updated_at
) VALUES (
  ${quote(runId)},
  'image-generation',
  'worker',
  'succeeded',
  'project',
  ${quote(input.ownerId)},
  ${quote(prompt)},
  unixepoch(),
  unixepoch()
);

INSERT INTO generation_artifacts (
  id, run_id, type, mime_type, file_path,
  owner_type, owner_id, owner_slot, effective_prompt,
  created_at, deleted_at
) VALUES (
  ${quote(artifactId)},
  ${quote(runId)},
  'image',
  'image/png',
  ${quote(filePath)},
  'projectPlanVersion',
  ${quote(input.ownerId)},
  ${quote(ownerSlot)},
  ${quote(prompt)},
  unixepoch(),
  NULL
);
`);

  return { artifactId, runId };
}
