const API_BASE = '/api';

export interface Provider {
  id: number;
  name: string;
  format: 'openai' | 'gemini';
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  isDefault: boolean;
}

export interface Model {
  id: string;
  name: string;
  description?: string;
}

// Provider API
export async function getProviders(): Promise<Provider[]> {
  const res = await fetch(`${API_BASE}/providers`);
  if (!res.ok) throw new Error('Failed to fetch providers');
  return res.json();
}

export async function createProvider(data: Omit<Provider, 'id'>): Promise<Provider> {
  const res = await fetch(`${API_BASE}/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create provider');
  return res.json();
}

export async function updateProvider(id: number, data: Partial<Provider>): Promise<Provider> {
  const res = await fetch(`${API_BASE}/providers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update provider');
  return res.json();
}

export async function deleteProvider(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/providers/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete provider');
}

// AI API
export async function fetchModels(providerId?: number): Promise<Model[]> {
  const res = await fetch(`${API_BASE}/ai/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId }),
  });
  if (!res.ok) throw new Error('Failed to fetch models');
  const data = await res.json();
  return data.models || [];
}

export async function generateText(prompt: string, providerId?: number): Promise<string> {
  const res = await fetch(`${API_BASE}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, providerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to generate text');
  }
  const data = await res.json();
  return data.text || '';
}

export async function generateImage(prompt: string, providerId?: number): Promise<{ imageBase64: string; mimeType: string }> {
  const res = await fetch(`${API_BASE}/ai/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, providerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to generate image');
  }
  return res.json();
}

export async function testConnection(params: {
  format: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/ai/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function hasApiConfig(): Promise<boolean> {
  try {
    const providers = await getProviders();
    return providers.some(p => p.isDefault);
  } catch {
    return false;
  }
}
