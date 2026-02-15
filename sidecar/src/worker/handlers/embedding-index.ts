import {
  indexAssetEmbedding,
  type IndexAssetEmbeddingResult,
} from '../../services/embedding/service';

export interface EmbeddingIndexInput {
  assetId?: string;
  assetIds?: string[];
  imagePath?: string;
  profileId?: string;
  force?: boolean;
  items?: Array<{
    assetId: string;
    imagePath?: string;
  }>;
}

export interface EmbeddingIndexOutput {
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
  results: IndexAssetEmbeddingResult[];
  failures: Array<{ assetId: string; error: string }>;
}

function normalizeTargets(input: EmbeddingIndexInput): Array<{
  assetId: string;
  imagePath?: string;
}> {
  const targets: Array<{ assetId: string; imagePath?: string }> = [];

  if (input.assetId?.trim()) {
    targets.push({
      assetId: input.assetId.trim(),
      imagePath: input.imagePath?.trim() || undefined,
    });
  }

  if (Array.isArray(input.assetIds)) {
    for (const assetId of input.assetIds) {
      if (typeof assetId !== 'string' || !assetId.trim()) continue;
      targets.push({ assetId: assetId.trim() });
    }
  }

  if (Array.isArray(input.items)) {
    for (const item of input.items) {
      if (!item || typeof item.assetId !== 'string' || !item.assetId.trim()) continue;
      targets.push({
        assetId: item.assetId.trim(),
        imagePath: item.imagePath?.trim() || undefined,
      });
    }
  }

  const deduped = new Map<string, { assetId: string; imagePath?: string }>();
  for (const target of targets) {
    const key = `${target.assetId}::${target.imagePath || ''}`;
    if (!deduped.has(key)) {
      deduped.set(key, target);
    }
  }
  return Array.from(deduped.values());
}

export async function embeddingIndexHandler(
  input: EmbeddingIndexInput,
): Promise<EmbeddingIndexOutput> {
  const targets = normalizeTargets(input);
  if (targets.length === 0) {
    throw new Error('assetId/assetIds/items 不能为空');
  }

  const results: IndexAssetEmbeddingResult[] = [];
  const failures: Array<{ assetId: string; error: string }> = [];
  let indexed = 0;
  let skipped = 0;

  for (const target of targets) {
    try {
      const result = await indexAssetEmbedding({
        assetId: target.assetId,
        imagePath: target.imagePath,
        profileId: input.profileId,
        force: input.force,
      });
      results.push(result);
      if (result.status === 'indexed') indexed += 1;
      else skipped += 1;
    } catch (error) {
      failures.push({
        assetId: target.assetId,
        error: error instanceof Error ? error.message : String(error || 'Unknown error'),
      });
    }
  }

  return {
    total: targets.length,
    indexed,
    skipped,
    failed: failures.length,
    results,
    failures,
  };
}
