import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SQLITE_RETRY_DELAYS_MS = [80, 160, 320, 640] as const;
const SQLITE_LOCK_ERROR_PATTERN = /(SQLITE_BUSY|SQLITE_LOCKED|database is locked)/i;

function sqliteEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function quote(value: string): string {
  return `'${sqliteEscape(value)}'`;
}

function bddDbPath(): string {
  return path.join(process.cwd(), '.tmp', 'bdd-data', 'shooting-planner.db');
}

function sleepSync(ms: number): void {
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0, ms);
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }
  return '';
}

function explainSqliteError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const row = error as Error & {
    status?: number;
    stderr?: unknown;
    stdout?: unknown;
  };

  const details = [row.message];
  if (typeof row.status === 'number') details.push(`status=${row.status}`);

  const stderr = toText(row.stderr).trim();
  if (stderr) details.push(`stderr=${stderr}`);

  const stdout = toText(row.stdout).trim();
  if (stdout) details.push(`stdout=${stdout}`);

  return details.join(' | ');
}

function isSqliteLockError(error: unknown): boolean {
  return SQLITE_LOCK_ERROR_PATTERN.test(explainSqliteError(error));
}

export function runSql(sql: string): void {
  const statements = sql.trim();
  if (!statements) return;

  const payload = `
PRAGMA busy_timeout=8000;
BEGIN IMMEDIATE;
${statements}
COMMIT;
`.trim();

  let attempt = 0;

  while (attempt <= SQLITE_RETRY_DELAYS_MS.length) {
    try {
      execFileSync('sqlite3', [bddDbPath(), payload], {
        stdio: 'pipe',
      });
      return;
    } catch (error) {
      if (!isSqliteLockError(error) || attempt === SQLITE_RETRY_DELAYS_MS.length) {
        throw new Error(
          `执行 sqlite SQL 失败: db=${bddDbPath()} attempt=${
            attempt + 1
          } reason=${explainSqliteError(error)}`,
        );
      }

      sleepSync(SQLITE_RETRY_DELAYS_MS[attempt]);
      attempt += 1;
    }
  }
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

export function seedAgentOutput(input: {
  sessionId: string;
  turnId: string;
  kind: 'photo' | 'copy';
  refId?: string;
  content?: Record<string, unknown>;
}): { outputId: string } {
  const outputId = `ao_${randomUUID()}`;
  const contentJson = JSON.stringify(input.content ?? null);
  const refIdSql = input.refId ? quote(input.refId) : 'NULL';

  runSql(`
INSERT INTO agent_outputs (
  id, session_id, turn_id, kind, ref_id, content_json, created_at
) VALUES (
  ${quote(outputId)},
  ${quote(input.sessionId)},
  ${quote(input.turnId)},
  ${quote(input.kind)},
  ${refIdSql},
  ${quote(contentJson)},
  unixepoch()
);
`);

  return { outputId };
}
