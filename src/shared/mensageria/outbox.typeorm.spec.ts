import { DataSource } from 'typeorm';
import { criarEnvelope, Fila } from './envelope';
import { MensagemProcessadaOrmEntity } from './mensagem-processada.orm-entity';
import { OutboxOrmEntity } from './outbox.orm-entity';
import { InboxTypeOrm, OutboxTypeOrm } from './outbox.typeorm';

describe('OutboxTypeOrm', () => {
  it('grava o envelope como linha pendente da fila de destino', async () => {
    const repo = { insert: jest.fn() };
    const dataSource = {
      manager: { getRepository: jest.fn(() => repo) },
    } as unknown as DataSource;
    const envelope = criarEnvelope('ReservarPecas', 'os-1', { itens: [] });

    await new OutboxTypeOrm(dataSource).adicionar(Fila.EXECUTION, envelope);

    expect(dataSource.manager.getRepository).toHaveBeenCalledWith(OutboxOrmEntity);
    const linha = repo.insert.mock.calls[0][0];
    expect(linha).toMatchObject({
      id: envelope.messageId,
      tipo: 'ReservarPecas',
      filaDestino: 'execution-comandos',
      corpo: envelope,
      correlationId: 'os-1',
      publicadaEm: null,
    });
    expect(typeof linha.criadaEm).toBe('number');
  });
});

describe('InboxTypeOrm', () => {
  let qb: Record<string, jest.Mock>;
  let dataSource: DataSource;

  beforeEach(() => {
    qb = {};
    for (const m of ['insert', 'values', 'orIgnore', 'returning']) qb[m] = jest.fn(() => qb);
    qb.execute = jest.fn();
    dataSource = {
      manager: { getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })) },
    } as unknown as DataSource;
  });

  it('primeira entrega: insere e devolve true', async () => {
    qb.execute.mockResolvedValue({ raw: [{ message_id: 'm-1' }] });
    await expect(new InboxTypeOrm(dataSource).registrar('m-1', 'OrcamentoAprovado')).resolves.toBe(
      true,
    );
    expect(dataSource.manager.getRepository).toHaveBeenCalledWith(MensagemProcessadaOrmEntity);
    expect(qb.values).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm-1', tipo: 'OrcamentoAprovado' }),
    );
    expect(qb.orIgnore).toHaveBeenCalled();
    expect(qb.returning).toHaveBeenCalledWith('message_id');
  });

  it('duplicata (ON CONFLICT DO NOTHING não devolve linha): false', async () => {
    qb.execute.mockResolvedValue({ raw: [] });
    await expect(new InboxTypeOrm(dataSource).registrar('m-1', 'X')).resolves.toBe(false);
  });
});
