import { DataSource } from 'typeorm';
import { OrdemServico } from '../domain/ordem-servico.entity';
import { StatusOS } from '../domain/status-os';
import { HistoricoOSOrmEntity, OrdemServicoOrmEntity } from './ordem-servico.orm-entity';
import {
  HistoricoOSTypeOrmRepository,
  OrdemServicoTypeOrmRepository,
} from './ordem-servico.typeorm.repository';

const linhaOrm = (sobrescrever: Partial<OrdemServicoOrmEntity> = {}): OrdemServicoOrmEntity =>
  Object.assign(new OrdemServicoOrmEntity(), {
    id: 'os-1',
    numero: 1,
    clienteId: 'c',
    veiculoId: 'v',
    status: StatusOS.AGUARDANDO_PAGAMENTO,
    itens: [
      {
        id: 'i',
        tipo: 'PECA',
        referenciaId: 'p',
        descricao: 'Óleo',
        quantidade: 2,
        precoUnitario: '40.00',
      },
    ],
    orcamentoId: 'orc',
    valorOrcamento: '80.00',
    pagamentoId: null,
    execucaoId: null,
    estoqueReservado: true,
    motivoCancelamento: null,
    recebidaEm: 1,
    orcamentoGeradoEm: 2,
    aprovadaEm: 3,
    pagaEm: null,
    execucaoIniciadaEm: null,
    finalizadaEm: null,
    entregueEm: null,
    canceladaEm: null,
    criadoEm: 1,
    atualizadoEm: 3,
    ...sobrescrever,
  });

function montar() {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getRawOne: jest.fn(),
  };
  const repo = {
    save: jest.fn(async (o: OrdemServicoOrmEntity) => ({
      ...o,
      id: o.id ?? 'novo',
      numero: o.numero ?? 9,
    })),
    findOne: jest.fn(),
    find: jest.fn(),
    insert: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };
  const dataSource = { manager: { getRepository: jest.fn(() => repo) } } as unknown as DataSource;
  return { qb, repo, dataSource };
}

describe('OrdemServicoTypeOrmRepository', () => {
  it('converte ida e volta preservando dinheiro, datas e estado da saga', async () => {
    const { repo, dataSource } = montar();
    const r = new OrdemServicoTypeOrmRepository(dataSource);
    const os = new OrdemServico({
      clienteId: 'c',
      veiculoId: 'v',
      itens: [
        {
          tipo: 'SERVICO',
          referenciaId: 's',
          descricao: 'Troca',
          quantidade: 1,
          precoUnitario: 150,
        },
      ],
      valorOrcamento: 150.5,
    });
    const salva = await r.create(os);
    const enviado = repo.save.mock.calls[0][0] as OrdemServicoOrmEntity;
    expect(enviado.valorOrcamento).toBe('150.50');
    expect(enviado.itens[0].precoUnitario).toBe('150.00');
    expect(enviado.criadoEm).toBe(os.criadoEm);
    expect(salva).toBeInstanceOf(OrdemServico);
    expect(salva.valorOrcamento).toBe(150.5);
    expect(salva.numero).toBe(9);

    await r.update(
      new OrdemServico({
        id: 'os-1',
        numero: 1,
        clienteId: 'c',
        veiculoId: 'v',
        itens: [
          {
            id: 'item-1',
            tipo: 'PECA',
            referenciaId: 'p',
            descricao: 'x',
            quantidade: 1,
            precoUnitario: 1,
          },
        ],
      }),
    );
    const atualizado = repo.save.mock.calls[1][0] as OrdemServicoOrmEntity;
    expect([atualizado.id, atualizado.numero, atualizado.valorOrcamento]).toEqual([
      'os-1',
      1,
      null,
    ]);
    expect(atualizado.itens[0].id).toBe('item-1');
  });

  it('busca por id, número e lista com filtro', async () => {
    const { repo, dataSource } = montar();
    const r = new OrdemServicoTypeOrmRepository(dataSource);
    repo.findOne
      .mockResolvedValueOnce(linhaOrm())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(linhaOrm())
      .mockResolvedValueOnce(null);
    const os = await r.findById('os-1');
    expect([os!.valorOrcamento, os!.itens[0].precoUnitario, os!.estoqueReservado]).toEqual([
      80,
      40,
      true,
    ]);
    expect(await r.findById('x')).toBeNull();
    expect((await r.findByNumero(1))!.id).toBe('os-1');
    expect(await r.findByNumero(2)).toBeNull();

    repo.find.mockResolvedValue([linhaOrm({ valorOrcamento: null, itens: undefined as never })]);
    const lista = await r.findAll({ status: StatusOS.RECEBIDA });
    expect(repo.find).toHaveBeenCalledWith({
      where: { status: StatusOS.RECEBIDA },
      order: { criadoEm: 'DESC' },
    });
    expect([lista[0].valorOrcamento, lista[0].itens]).toEqual([null, []]);
  });

  it('bloqueia a linha antes de ler para atualizar', async () => {
    const { qb, repo, dataSource } = montar();
    const r = new OrdemServicoTypeOrmRepository(dataSource);
    qb.getOne.mockResolvedValueOnce({ id: 'os-1' }).mockResolvedValueOnce(null);
    repo.findOne.mockResolvedValue(linhaOrm());
    expect((await r.findByIdParaAtualizar('os-1'))!.id).toBe('os-1');
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(await r.findByIdParaAtualizar('x')).toBeNull();
  });

  it('calcula o tempo médio de execução em ms', async () => {
    const { qb, dataSource } = montar();
    const r = new OrdemServicoTypeOrmRepository(dataSource);
    qb.getRawOne.mockResolvedValueOnce({ media: '1500.4' }).mockResolvedValueOnce({ media: null });
    expect(await r.tempoMedioExecucaoMs()).toBe(1500);
    expect(await r.tempoMedioExecucaoMs()).toBeNull();
  });
});

describe('HistoricoOSTypeOrmRepository', () => {
  it('grava e lista em ordem cronológica', async () => {
    const { repo, dataSource } = montar();
    const r = new HistoricoOSTypeOrmRepository(dataSource);
    await r.registrar({
      osId: 'os-1',
      evento: 'E',
      statusAnterior: null,
      statusNovo: StatusOS.RECEBIDA,
      em: 5,
    });
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ detalhe: null, em: 5 }));

    repo.find.mockResolvedValue([
      Object.assign(new HistoricoOSOrmEntity(), {
        osId: 'os-1',
        evento: 'E',
        statusAnterior: null,
        statusNovo: 'RECEBIDA',
        detalhe: 'd',
        em: 5,
      }),
    ]);
    expect(await r.listar('os-1')).toEqual([
      {
        osId: 'os-1',
        evento: 'E',
        statusAnterior: null,
        statusNovo: 'RECEBIDA',
        detalhe: 'd',
        em: 5,
      },
    ]);
    expect(repo.find).toHaveBeenCalledWith({ where: { osId: 'os-1' }, order: { em: 'ASC' } });
  });
});

describe('mapeamento ORM da OS', () => {
  it('liga OS e itens nos dois sentidos', () => {
    const { getMetadataArgsStorage } = jest.requireActual<typeof import('typeorm')>('typeorm');
    const relacoes = getMetadataArgsStorage().relations.filter((r) =>
      ['itens', 'ordemServico'].includes(r.propertyName),
    );
    expect(relacoes).toHaveLength(2);
    for (const r of relacoes) {
      const alvo = (r.type as () => { name: string })();
      const inverso = r.inverseSideProperty as (o: Record<string, unknown>) => unknown;
      expect(['ItemOSOrmEntity', 'OrdemServicoOrmEntity']).toContain(alvo.name);
      expect(inverso({ itens: 'i', ordemServico: 'o' })).toBeDefined();
    }
  });
});
