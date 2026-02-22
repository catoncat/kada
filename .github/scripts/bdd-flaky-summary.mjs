#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const CWD = process.cwd();
const cucumberInputPath =
  process.env.BDD_CUCUMBER_JSON ?? 'test-results/cucumber-bdd.json';
const playwrightInputPath =
  process.env.BDD_PLAYWRIGHT_JSON ?? 'test-results/playwright-bdd.json';
const featuresRoot = process.env.BDD_FEATURES_ROOT ?? 'tests/bdd/features';
const outDir = process.env.BDD_FLAKY_OUT_DIR ?? 'test-results/flaky';
const outJson = path.join(outDir, 'nightly-flaky-summary.json');
const outMd = path.join(outDir, 'nightly-flaky-summary.md');

function toPosix(input) {
  return input.split(path.sep).join('/');
}

async function listFeatureFiles(rootDir) {
  const absRoot = path.resolve(CWD, rootDir);
  const files = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.feature')) {
        files.push(toPosix(path.relative(CWD, fullPath)));
      }
    }
  }

  await walk(absRoot);
  files.sort();
  return files;
}

function ensureFeature(map, uri, name = '') {
  const key = uri || '(unknown-feature)';
  if (!map.has(key)) {
    map.set(key, {
      uri: key,
      name,
      totalScenarios: 0,
      failedScenarios: 0,
      failedSteps: 0,
    });
  } else if (name && !map.get(key).name) {
    map.get(key).name = name;
  }

  return map.get(key);
}

function failLikeStatuses(scenario) {
  const steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
  return steps
    .map((step) => step?.result?.status)
    .filter((status) => typeof status === 'string' && status !== 'passed' && status !== 'skipped');
}

function isSpecFailed(spec) {
  return spec?.ok === false;
}

function countFailLikeResults(spec) {
  const tests = Array.isArray(spec?.tests) ? spec.tests : [];
  let count = 0;
  for (const test of tests) {
    const results = Array.isArray(test?.results) ? test.results : [];
    for (const result of results) {
      const status = result?.status;
      if (typeof status === 'string' && status !== 'passed' && status !== 'skipped') {
        count += 1;
      }
    }
  }
  return count;
}

function normalizeFeatureUriFromSpecFile(file) {
  const normalized = toPosix(String(file || ''));
  if (!normalized) return '(unknown-feature)';
  if (normalized.startsWith('tests/bdd/features/') && normalized.endsWith('.feature')) {
    return normalized;
  }

  const asFeature = normalized.replace(/\.feature\.spec\.[cm]?[jt]sx?$/, '.feature');
  if (asFeature.startsWith('features/')) {
    return `tests/bdd/${asFeature}`;
  }
  if (asFeature.startsWith('.features-gen/features/')) {
    return `tests/bdd/${asFeature.replace('.features-gen/', '')}`;
  }
  return asFeature;
}

function collectPlaywrightSpecs(suites, inheritedFile, into) {
  if (!Array.isArray(suites)) return;
  for (const suite of suites) {
    if (!suite || typeof suite !== 'object') continue;
    const suiteFile = typeof suite.file === 'string' ? suite.file : inheritedFile;
    const specs = Array.isArray(suite.specs) ? suite.specs : [];
    for (const spec of specs) {
      if (!spec || typeof spec !== 'object') continue;
      const specFile = typeof spec.file === 'string' ? spec.file : suiteFile;
      into.push({ file: specFile, spec });
    }
    collectPlaywrightSpecs(suite.suites, suiteFile, into);
  }
}

async function main() {
  const featureMap = new Map();
  const knownFeatures = await listFeatureFiles(featuresRoot);
  for (const file of knownFeatures) {
    ensureFeature(featureMap, file);
  }

  let sourceStatus = 'ok';
  let usedInput = 'cucumber';
  let cucumberData = null;
  try {
    const raw = await fs.readFile(path.resolve(CWD, cucumberInputPath), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cucumberData = parsed;
    } else {
      sourceStatus = 'invalid-shape';
    }
  } catch (error) {
    sourceStatus = error?.code === 'ENOENT' ? 'missing' : 'invalid-json';
  }

  if (Array.isArray(cucumberData)) {
    for (const feature of cucumberData) {
      const uri = toPosix(String(feature?.uri || ''));
      const item = ensureFeature(featureMap, uri, String(feature?.name || ''));
      const scenarios = Array.isArray(feature?.elements) ? feature.elements : [];

      item.totalScenarios += scenarios.length;
      for (const scenario of scenarios) {
        const failed = failLikeStatuses(scenario);
        if (failed.length > 0) {
          item.failedScenarios += 1;
          item.failedSteps += failed.length;
        }
      }
    }
  } else {
    let playwrightData = null;
    try {
      const raw = await fs.readFile(path.resolve(CWD, playwrightInputPath), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        playwrightData = parsed;
        sourceStatus = 'playwright-fallback';
        usedInput = 'playwright';
      } else {
        sourceStatus = `${sourceStatus}+playwright-invalid-shape`;
      }
    } catch (error) {
      const suffix = error?.code === 'ENOENT' ? 'playwright-missing' : 'playwright-invalid-json';
      sourceStatus = `${sourceStatus}+${suffix}`;
    }

    if (playwrightData) {
      const specs = [];
      collectPlaywrightSpecs(playwrightData.suites, '', specs);

      for (const row of specs) {
        const uri = normalizeFeatureUriFromSpecFile(row.file);
        const item = ensureFeature(featureMap, uri);
        item.totalScenarios += 1;

        if (isSpecFailed(row.spec)) {
          item.failedScenarios += 1;
          const failLikeResults = countFailLikeResults(row.spec);
          item.failedSteps += failLikeResults > 0 ? failLikeResults : 1;
        }
      }
    }
  }

  const byFeature = [...featureMap.values()].sort(
    (left, right) =>
      right.failedScenarios - left.failedScenarios || left.uri.localeCompare(right.uri),
  );

  const totals = byFeature.reduce(
    (acc, feature) => {
      acc.features += 1;
      acc.scenarios += feature.totalScenarios;
      acc.failedScenarios += feature.failedScenarios;
      acc.failedSteps += feature.failedSteps;
      if (feature.failedScenarios > 0) {
        acc.featuresWithFailures += 1;
      }
      return acc;
    },
    {
      features: 0,
      featuresWithFailures: 0,
      scenarios: 0,
      failedScenarios: 0,
      failedSteps: 0,
    },
  );

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceStatus,
    input: {
      usedInput,
      cucumberJson: cucumberInputPath,
      playwrightJson: playwrightInputPath,
      featuresRoot,
    },
    run: {
      workflow: process.env.GITHUB_WORKFLOW ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      sha: process.env.GITHUB_SHA ?? null,
      ref: process.env.GITHUB_REF ?? null,
    },
    totals,
    byFeature,
  };

  const markdown = [
    '# BDD Nightly Failure Summary',
    '',
    `- generatedAt: ${summary.generatedAt}`,
    `- sourceStatus: ${summary.sourceStatus}`,
    `- runId: ${summary.run.runId ?? '-'}, attempt: ${summary.run.runAttempt ?? '-'}`,
    '',
    '## Totals',
    '',
    '| metric | value |',
    '| --- | ---: |',
    `| features | ${totals.features} |`,
    `| featuresWithFailures | ${totals.featuresWithFailures} |`,
    `| scenarios | ${totals.scenarios} |`,
    `| failedScenarios | ${totals.failedScenarios} |`,
    `| failedSteps | ${totals.failedSteps} |`,
    '',
    '## By Feature',
    '',
    '| feature | failedScenarios | totalScenarios | failedSteps |',
    '| --- | ---: | ---: | ---: |',
    ...byFeature.map(
      (feature) =>
        `| ${feature.uri} | ${feature.failedScenarios} | ${feature.totalScenarios} | ${feature.failedSteps} |`,
    ),
    '',
  ].join('\n');

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outJson, JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(outMd, markdown, 'utf8');

  console.log(`[bdd-flaky] wrote ${outJson}`);
  console.log(`[bdd-flaky] wrote ${outMd}`);
}

main().catch(async (error) => {
  await fs.mkdir(outDir, { recursive: true });
  const fallback = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceStatus: 'script-error',
    error: String(error?.stack || error),
  };
  await fs.writeFile(outJson, JSON.stringify(fallback, null, 2), 'utf8');
  await fs.writeFile(
    outMd,
    `# BDD Nightly Failure Summary\n\nscript-error\n\n\`\`\`\n${fallback.error}\n\`\`\`\n`,
    'utf8',
  );
  process.exitCode = 0;
});
