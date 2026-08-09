import { AppError } from './errors.js';
export async function requestJson<T>(url: string, init: RequestInit = {}, acceptable: number[] = [200,201,202]): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!acceptable.includes(res.status)) throw new AppError(`HTTP ${res.status} ${url}: ${text.slice(0, 1000)}`, 'HTTP_ERROR');
  return text ? JSON.parse(text) as T : ({} as T);
}
