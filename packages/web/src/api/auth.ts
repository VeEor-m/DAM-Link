import { api } from './client.js';
import type { MeResponse, PublicUser } from '@dam-link/contracts';

export async function register(input: { email: string; password: string; displayName: string }): Promise<{ user: PublicUser }> {
  return api<{ user: PublicUser }>('/auth/register', { method: 'POST', body: input });
}

export async function login(input: { email: string; password: string }): Promise<{ user: PublicUser }> {
  return api<{ user: PublicUser }>('/auth/login', { method: 'POST', body: input });
}

export async function logout(): Promise<void> {
  await api<void>('/auth/logout', { method: 'POST' });
}

export async function me(): Promise<MeResponse> {
  return api<MeResponse>('/auth/me');
}
