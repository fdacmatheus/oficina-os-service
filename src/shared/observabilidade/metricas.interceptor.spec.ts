import { CallHandler, ExecutionContext } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { of } from 'rxjs';
import { MetricasInterceptor } from './metricas.interceptor';
import { MetricasService } from './metricas.service';

describe('MetricasInterceptor', () => {
  let metricas: MetricasService;
  let interceptor: MetricasInterceptor;
  const next: CallHandler = { handle: () => of('resposta') };

  const contexto = (req: Record<string, unknown>, res: EventEmitter, tipo = 'http') =>
    ({
      getType: () => tipo,
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    }) as unknown as ExecutionContext;

  const resposta = (statusCode: number) => Object.assign(new EventEmitter(), { statusCode });

  const contagens = async () =>
    (await metricas.requisicoes.get()).values.map((v) => ({ ...v.labels, n: v.value }));

  beforeEach(() => {
    metricas = new MetricasService();
    interceptor = new MetricasInterceptor(metricas);
  });

  it('registra contador e histograma no finish com a rota padrão do Express', async () => {
    const res = resposta(404);
    const obs = interceptor.intercept(
      contexto(
        { method: 'GET', path: '/api/clientes/123', route: { path: '/api/clientes/:id' } },
        res,
      ),
      next,
    );
    expect(await contagens()).toEqual([]);

    res.emit('finish');
    res.emit('finish');

    expect(await contagens()).toEqual([
      { method: 'GET', route: '/api/clientes/:id', status: '404', n: 1 },
    ]);
    const hist = (await metricas.duracaoRequisicao.get()).values.find(
      (v) => v.metricName === 'http_request_duration_seconds_count',
    );
    expect(hist?.value).toBe(1);
    obs.subscribe((v) => expect(v).toBe('resposta'));
  });

  it('sem rota registrada usa o path; sem path usa "desconhecida"', async () => {
    const r1 = resposta(200);
    interceptor.intercept(contexto({ method: 'POST', path: '/x' }, r1), next);
    r1.emit('finish');
    const r2 = resposta(500);
    interceptor.intercept(contexto({ method: 'GET' }, r2), next);
    r2.emit('finish');
    expect((await contagens()).map((c) => c.route).sort()).toEqual(['/x', 'desconhecida']);
  });

  it('não instrumenta /metrics nem contextos não-HTTP', async () => {
    const r1 = resposta(200);
    interceptor.intercept(contexto({ method: 'GET', path: '/api/metrics' }, r1), next);
    r1.emit('finish');
    const r2 = resposta(200);
    interceptor.intercept(contexto({}, r2, 'rpc'), next);
    r2.emit('finish');
    expect(await contagens()).toEqual([]);
  });
});
