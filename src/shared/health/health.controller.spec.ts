import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('responde ok com o uptime do processo', () => {
    const r = new HealthController().check();
    expect(r.status).toBe('ok');
    expect(r.uptime).toBeGreaterThan(0);
  });
});
