import { apiUrl } from './api-config';

export interface EmbeddingProfile {
  id: string;
  providerId: string | null;
  endpoint: string;
  apiKeyRef: string | null;
  model: string;
  vectorDim: number;
  normalize: boolean;
  status: 'active' | 'reindexing' | 'disabled';
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SaveEmbeddingProfileInput {
  id?: string;
  providerId?: string | null;
  endpoint: string;
  apiKeyRef?: string | null;
  model: string;
  vectorDim: number;
  normalize?: boolean;
}

export interface EmbeddingTaskSummary {
  id: string;
  type: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  error?: string | null;
}

export interface EmbeddingStatus {
  profile: EmbeddingProfile | null;
  vectorEngine: {
    mode: 'sqlite-vec' | 'fallback-scan';
    initialized: boolean;
    detail: string | null;
  };
  stats: {
    totalAssets: number;
    indexedAssets: number;
    coverage: number;
  };
  tasks: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    latest: EmbeddingTaskSummary | null;
    latestFailed: EmbeddingTaskSummary | null;
  };
}

export interface SaveEmbeddingProfileResponse {
  profile: EmbeddingProfile;
  needsReindex: boolean;
  reindexTask: EmbeddingTaskSummary | null;
}

export interface EmbeddingSearchInput {
  queryType: 'text' | 'image';
  text?: string;
  imagePath?: string;
  imageBase64?: string;
  assetId?: string;
  topK?: number;
  candidateAssetIds?: string[];
}

export interface EmbeddingSearchResult {
  profileId: string;
  queryType: 'text' | 'image';
  source: 'sqlite-vec' | 'fallback-scan';
  vectorEngine: {
    mode: 'sqlite-vec' | 'fallback-scan';
    initialized: boolean;
    detail: string | null;
  };
  results: Array<{
    assetId: string;
    profileId: string;
    score: number;
    distance: number | null;
    similarity?: number;
    source: 'sqlite-vec' | 'fallback-scan';
    asset: {
      assetType: 'scene' | 'model' | 'upload' | 'unknown';
      name: string | null;
      imagePath: string | null;
    };
  }>;
}

export interface EmbeddingTaskResponse {
  task: EmbeddingTaskSummary;
}

async function parseResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || fallbackError);
  }
  return data as T;
}

export async function fetchEmbeddingProfile(): Promise<EmbeddingProfile | null> {
  const response = await fetch(apiUrl('/api/embeddings/profile'));
  const data = await parseResponse<{ profile: EmbeddingProfile | null }>(
    response,
    '获取 embedding profile 失败',
  );
  return data.profile;
}

export async function saveEmbeddingProfile(
  input: SaveEmbeddingProfileInput,
): Promise<SaveEmbeddingProfileResponse> {
  const response = await fetch(apiUrl('/api/embeddings/profile'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponse<SaveEmbeddingProfileResponse>(
    response,
    '保存 embedding profile 失败',
  );
}

export async function fetchEmbeddingStatus(): Promise<EmbeddingStatus> {
  const response = await fetch(apiUrl('/api/embeddings/status'));
  return parseResponse<EmbeddingStatus>(response, '获取 embedding 状态失败');
}

export async function requestEmbeddingReindex(
  profileId?: string,
): Promise<EmbeddingTaskResponse> {
  const response = await fetch(apiUrl('/api/embeddings/reindex'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId }),
  });
  return parseResponse<EmbeddingTaskResponse>(
    response,
    '创建 embedding 重建任务失败',
  );
}

export async function requestEmbeddingIndex(input: {
  assetId?: string;
  assetIds?: string[];
  imagePath?: string;
  profileId?: string;
  force?: boolean;
}): Promise<EmbeddingTaskResponse> {
  const response = await fetch(apiUrl('/api/embeddings/index'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponse<EmbeddingTaskResponse>(
    response,
    '创建 embedding 索引任务失败',
  );
}

export async function searchEmbeddingAssets(
  input: EmbeddingSearchInput,
): Promise<EmbeddingSearchResult> {
  const response = await fetch(apiUrl('/api/embeddings/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponse<EmbeddingSearchResult>(response, 'embedding 搜索失败');
}
