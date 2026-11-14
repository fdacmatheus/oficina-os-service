import { contextoRequisicao } from './correlacao.middleware';
import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  const formatoOriginal = process.env.LOG_FORMAT;
  let log: jest.SpyInstance;
  let erro: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation();
    erro = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    process.env.LOG_FORMAT = formatoOriginal;
    jest.restoreAllMocks();
  });

  describe('modo texto', () => {
    let logger: LoggerService;
    beforeEach(() => {
      delete process.env.LOG_FORMAT;
      logger = new LoggerService();
    });

    it('formata nível, contexto e correlationId', () => {
      contextoRequisicao.run({ correlationId: 'os-1' }, () => logger.warn('atenção', 'Saga'));
      expect(log).toHaveBeenCalledWith('WARN [Saga] atenção (os-1)');
    });

    it('sem contexto nem correlação fica só a mensagem; error vai para stderr com o trace', () => {
      logger.log('oi');
      logger.error('falhou');
      logger.error('quebrou', 'Error: x\n    at y');
      expect(log.mock.calls).toEqual([['INFO oi']]);
      expect(erro.mock.calls).toEqual([['ERROR falhou'], ['ERROR quebrou\nError: x\n    at y']]);
    });
  });

  describe('modo JSON', () => {
    let logger: LoggerService;
    beforeEach(() => {
      process.env.LOG_FORMAT = 'json';
      logger = new LoggerService();
    });

    const ultimaLinha = (spy: jest.SpyInstance) => JSON.parse(spy.mock.calls.at(-1)[0]);

    it('inclui serviço, nível, contexto, timestamp epoch e correlationId da requisição', () => {
      contextoRequisicao.run({ correlationId: 'os-9' }, () => logger.log('criada', 'OS'));
      const linha = ultimaLinha(log);
      expect(linha).toMatchObject({
        nivel: 'info',
        servico: 'oficina-os-service',
        contexto: 'OS',
        correlationId: 'os-9',
        mensagem: 'criada',
      });
      expect(typeof linha.timestamp).toBe('number');
      expect(linha).not.toHaveProperty('detalhe');
    });

    it('serializa mensagem não-string', () => {
      logger.debug({ a: 1 });
      expect(ultimaLinha(log)).toMatchObject({ nivel: 'debug', mensagem: '{"a":1}' });
      logger.verbose('v');
      expect(ultimaLinha(log).nivel).toBe('debug');
      logger.warn('w');
      expect(ultimaLinha(log).nivel).toBe('warn');
    });

    it('error vai para stderr com o trace em detalhe', () => {
      logger.error('quebrou', 'stack...', 'Ctx');
      expect(log).not.toHaveBeenCalled();
      expect(ultimaLinha(erro)).toMatchObject({
        nivel: 'error',
        mensagem: 'quebrou',
        detalhe: 'stack...',
        contexto: 'Ctx',
      });
    });
  });
});
