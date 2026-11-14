import type { Response } from 'express';
import { MetricasController } from './metricas.controller';
import { MetricasService } from './metricas.service';

describe('MetricasController', () => {
  it('expõe as métricas no formato do Prometheus, incluindo as padrão do processo', async () => {
    const metricas = new MetricasService();
    metricas.onModuleInit();
    metricas.ordensCriadas.inc();
    const res = { set: jest.fn(), send: jest.fn() };

    await new MetricasController(metricas).expor(res as unknown as Response);

    expect(res.set).toHaveBeenCalledWith('Content-Type', metricas.contentType);
    expect(metricas.contentType).toMatch(/text\/plain/);
    const corpo: string = res.send.mock.calls[0][0];
    expect(corpo).toContain('oficina_ordens_servico_criadas_total 1');
    expect(corpo).toContain('oficina_process_cpu_user_seconds_total');
  });
});
