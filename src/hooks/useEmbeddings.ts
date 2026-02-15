import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchEmbeddingProfile,
  fetchEmbeddingStatus,
  requestEmbeddingIndex,
  requestEmbeddingReindex,
  saveEmbeddingProfile,
  searchEmbeddingAssets,
  type EmbeddingSearchInput,
  type SaveEmbeddingProfileInput,
} from '@/lib/embeddings-api';

export const embeddingKeys = {
  all: ['embeddings'] as const,
  profile: () => [...embeddingKeys.all, 'profile'] as const,
  status: () => [...embeddingKeys.all, 'status'] as const,
  search: () => [...embeddingKeys.all, 'search'] as const,
};

export function useEmbeddingProfile() {
  return useQuery({
    queryKey: embeddingKeys.profile(),
    queryFn: fetchEmbeddingProfile,
  });
}

export function useEmbeddingStatus() {
  return useQuery({
    queryKey: embeddingKeys.status(),
    queryFn: fetchEmbeddingStatus,
    refetchInterval: 5000,
  });
}

export function useSaveEmbeddingProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveEmbeddingProfileInput) => saveEmbeddingProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: embeddingKeys.all });
    },
  });
}

export function useReindexEmbeddings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId?: string) => requestEmbeddingReindex(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: embeddingKeys.all });
    },
  });
}

export function useIndexEmbeddings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      assetId?: string;
      assetIds?: string[];
      imagePath?: string;
      profileId?: string;
      force?: boolean;
    }) => requestEmbeddingIndex(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: embeddingKeys.all });
    },
  });
}

export function useSearchEmbeddings() {
  return useMutation({
    mutationFn: (input: EmbeddingSearchInput) => searchEmbeddingAssets(input),
  });
}
