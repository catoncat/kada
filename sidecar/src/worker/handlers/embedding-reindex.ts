import { reindexAllAssets } from '../../services/embedding/service';

export interface EmbeddingReindexInput {
  profileId?: string;
}

export async function embeddingReindexHandler(input: EmbeddingReindexInput) {
  return reindexAllAssets(input.profileId);
}
