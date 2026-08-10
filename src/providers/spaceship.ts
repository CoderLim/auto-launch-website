import { requiredEnv, AppError } from '../utils/errors.js';

/** Spaceship public API: https://docs.spaceship.dev/ — PUT /v1/domains/{domain}/nameservers */
export class SpaceshipProvider {
  async setNameservers(domain: string, nameservers: string[]) {
    if (nameservers.length < 2) throw new AppError('Spaceship requires at least 2 nameservers', 'SPACESHIP_ERROR');
    const res = await fetch(`https://spaceship.dev/api/v1/domains/${encodeURIComponent(domain)}/nameservers`, {
      method: 'PUT',
      headers: {
        'X-API-Key': requiredEnv('SPACESHIP_API_KEY'),
        'X-API-Secret': requiredEnv('SPACESHIP_API_SECRET'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider: 'custom', hosts: nameservers }),
    });
    const text = await res.text();
    if (!res.ok) throw new AppError(`Spaceship set nameservers failed (${res.status}): ${text.slice(0, 1200)}`, 'SPACESHIP_ERROR');
  }
}
