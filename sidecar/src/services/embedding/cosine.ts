import { calculateVectorNorm } from './vector-codec';

export interface CosineScanCandidate<TMeta = Record<string, unknown>> {
  assetId: string;
  vector: number[];
  vectorNorm?: number | null;
  meta?: TMeta;
}

export interface CosineScanResult<TMeta = Record<string, unknown>> {
  assetId: string;
  similarity: number;
  score: number;
  meta?: TMeta;
}

export function cosineSimilarity(
  query: number[],
  target: number[],
  queryNorm = calculateVectorNorm(query),
  targetNorm = calculateVectorNorm(target),
): number {
  if (query.length !== target.length) {
    throw new Error(
      `Vector length mismatch: query=${query.length}, target=${target.length}`,
    );
  }

  if (queryNorm <= 0 || targetNorm <= 0) return 0;

  let dot = 0;
  for (let i = 0; i < query.length; i += 1) {
    dot += query[i] * target[i];
  }
  return dot / (queryNorm * targetNorm);
}

export function topKByCosine<TMeta = Record<string, unknown>>(params: {
  query: number[];
  candidates: CosineScanCandidate<TMeta>[];
  k: number;
}): CosineScanResult<TMeta>[] {
  const { query, candidates, k } = params;
  const queryNorm = calculateVectorNorm(query);

  const ranked = candidates.map((candidate) => {
    const similarity = cosineSimilarity(
      query,
      candidate.vector,
      queryNorm,
      candidate.vectorNorm ?? calculateVectorNorm(candidate.vector),
    );

    return {
      assetId: candidate.assetId,
      similarity,
      score: (similarity + 1) / 2,
      meta: candidate.meta,
    };
  });

  ranked.sort((a, b) => b.similarity - a.similarity);
  return ranked.slice(0, Math.max(1, k));
}
