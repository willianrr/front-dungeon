// Cliente REST do backend (accounts/characters).
// Le a URL de ./runtimeConfig (runtime > import.meta.env > localhost).

import { API_URL } from './runtimeConfig';

interface Envelope<T> {
  data?: T;
  error?: string;
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  const body = (await response.json().catch(() => ({}))) as Envelope<T>;
  if (!response.ok || body.error) {
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return body.data as T;
}

export interface AuthResult {
  token: string;
  account: { id: number; email: string };
}

export interface ServerCharacter {
  id: number;
  name: string;
  level: number;
  class_id: string;
}

export function register(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/accounts/register', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function login(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/accounts/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function listCharacters(token: string): Promise<ServerCharacter[]> {
  return request<ServerCharacter[]>('/characters', { token });
}

export function createCharacter(token: string, name: string): Promise<ServerCharacter> {
  return request<ServerCharacter>('/characters', { method: 'POST', token, body: JSON.stringify({ name }) });
}
