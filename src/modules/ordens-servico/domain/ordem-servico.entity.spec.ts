import { ItemOS } from './item-os';
import { OrdemServico } from './ordem-servico.entity';
import { podeTransitar, prioridadeListagem, StatusOS, transicoesPermitidas } from './status-os';

const nova = () =>
  new OrdemServico({
    clienteId: 'c',
    veiculoId: 'v',
    itens: [
      { tipo: 'SERVICO', referenciaId: 's', descricao: 'Troca', quantidade: 1, precoUnitario: 150 },
      { tipo: 'PECA', referenciaId: 'p', descricao: 'Óleo', quantidade: 4, precoUnitario: 40.5 },
    ],
  });

describe('OrdemServico', () => {
  it('exige cliente e veículo', () => {
    expect(() => new OrdemServico({ clienteId: '', veiculoId: 'v' })).toThrow('clienteId');
    expect(() => new OrdemServico({ clienteId: 'c', veiculoId: '' })).toThrow('veiculoId');
  });

  it('nasce RECEBIDA, sem compensações pendentes e com datas em epoch ms', () => {
    const antes = Date.now();
    const os = nova();
    expect(os.status).toBe(StatusOS.RECEBIDA);
    expect(os.estoqueReservado).toBe(false);
    expect(os.recebidaEm).toBeGreaterThanOrEqual(antes);
    expect(Number.isInteger(os.criadoEm)).toBe(true);
    expect(os.totalItens).toBe(312);
    expect(os.pecas).toHaveLength(1);
    expect(os.emAndamento).toBe(true);
  });

  it('percorre o caminho feliz preenchendo cada data', () => {
    const os = nova();
    os.registrarOrcamento('orc', 312);
    expect([os.status, os.orcamentoId, os.valorOrcamento]).toEqual([
      StatusOS.AGUARDANDO_APROVACAO,
      'orc',
      312,
    ]);
    os.aprovarComEstoqueReservado();
    expect([os.status, os.estoqueReservado]).toEqual([StatusOS.AGUARDANDO_PAGAMENTO, true]);
    os.registrarPagamento('pag');
    expect([os.status, os.pagamentoId]).toEqual([StatusOS.AGUARDANDO_EXECUCAO, 'pag']);
    os.iniciarExecucao('exe');
    expect(os.tempoExecucaoMs).toBeNull();
    os.finalizar('exe');
    expect(os.tempoExecucaoMs).toBeGreaterThanOrEqual(0);
    os.entregar();
    expect(os.status).toBe(StatusOS.ENTREGUE);
    expect(os.emAndamento).toBe(false);
    for (const d of [
      os.orcamentoGeradoEm,
      os.aprovadaEm,
      os.pagaEm,
      os.execucaoIniciadaEm,
      os.finalizadaEm,
      os.entregueEm,
    ]) {
      expect(typeof d).toBe('number');
    }
  });

  it('OS só com serviços não marca estoque reservado', () => {
    const os = new OrdemServico({ clienteId: 'c', veiculoId: 'v' });
    os.adicionarItem({
      tipo: 'SERVICO',
      referenciaId: 's',
      descricao: 'x',
      quantidade: 1,
      precoUnitario: 1,
    });
    os.registrarOrcamento('o', 1);
    os.aprovarComEstoqueReservado();
    expect(os.estoqueReservado).toBe(false);
  });

  it('não aceita item depois que o orçamento foi gerado', () => {
    const os = nova();
    os.registrarOrcamento('o', 1);
    expect(() =>
      os.adicionarItem({
        tipo: 'PECA',
        referenciaId: 'p',
        descricao: 'x',
        quantidade: 1,
        precoUnitario: 1,
      }),
    ).toThrow('antes de o orçamento');
  });

  it('rejeita transição inválida', () => {
    expect(() => nova().registrarPagamento('p')).toThrow(
      'Transição inválida: RECEBIDA → AGUARDANDO_EXECUCAO',
    );
  });

  it.each([
    [
      'RECEBIDA',
      [],
      {
        liberarEstoque: false,
        cancelarOrcamento: false,
        estornarPagamento: false,
        cancelarExecucao: false,
      },
    ],
    [
      'AGUARDANDO_APROVACAO',
      ['orc'],
      {
        liberarEstoque: false,
        cancelarOrcamento: true,
        estornarPagamento: false,
        cancelarExecucao: false,
      },
    ],
    [
      'AGUARDANDO_PAGAMENTO',
      ['orc', 'apr'],
      {
        liberarEstoque: true,
        cancelarOrcamento: true,
        estornarPagamento: false,
        cancelarExecucao: false,
      },
    ],
    [
      'AGUARDANDO_EXECUCAO',
      ['orc', 'apr', 'pag'],
      {
        liberarEstoque: true,
        cancelarOrcamento: false,
        estornarPagamento: true,
        cancelarExecucao: true,
      },
    ],
    [
      'EM_EXECUCAO',
      ['orc', 'apr', 'pag', 'exe'],
      {
        liberarEstoque: true,
        cancelarOrcamento: false,
        estornarPagamento: true,
        cancelarExecucao: true,
      },
    ],
  ])('cancelar a partir de %s devolve as compensações certas', (_estado, passos, esperado) => {
    const os = nova();
    const acoes: Record<string, () => void> = {
      orc: () => os.registrarOrcamento('o', 1),
      apr: () => os.aprovarComEstoqueReservado(),
      pag: () => os.registrarPagamento('p'),
      exe: () => os.iniciarExecucao('e'),
    };
    passos.forEach((p) => acoes[p]());
    expect(os.cancelar('motivo')).toEqual(esperado);
    expect(os.status).toBe(StatusOS.CANCELADA);
    expect(os.motivoCancelamento).toBe('motivo');
    expect(os.estoqueReservado).toBe(false);
    expect(typeof os.canceladaEm).toBe('number');
  });

  it('não cancela OS finalizada', () => {
    const os = nova();
    os.registrarOrcamento('o', 1);
    os.aprovarComEstoqueReservado();
    os.registrarPagamento('p');
    os.finalizar('e');
    expect(() => os.cancelar('x')).toThrow('Transição inválida');
  });
});

describe('ItemOS', () => {
  const base = {
    tipo: 'PECA' as const,
    referenciaId: 'p',
    descricao: 'x',
    quantidade: 2,
    precoUnitario: 10.556,
  };

  it('arredonda o preço e calcula o subtotal', () => {
    const item = new ItemOS(base);
    expect(item.precoUnitario).toBe(10.56);
    expect(item.subtotal).toBe(21.12);
  });

  it.each([
    [{ tipo: 'OUTRO' }, 'Tipo de item inválido'],
    [{ referenciaId: '' }, 'referenciaId'],
    [{ quantidade: 0 }, 'Quantidade'],
    [{ quantidade: 1.5 }, 'Quantidade'],
    [{ precoUnitario: -1 }, 'precoUnitario'],
  ])('valida %o', (alteracao, erro) => {
    expect(() => new ItemOS({ ...base, ...alteracao } as never)).toThrow(erro);
  });
});

describe('status da OS', () => {
  it('conhece as transições permitidas', () => {
    expect(podeTransitar(StatusOS.AGUARDANDO_EXECUCAO, StatusOS.FINALIZADA)).toBe(true);
    expect(podeTransitar(StatusOS.ENTREGUE, StatusOS.CANCELADA)).toBe(false);
    const permitidas = transicoesPermitidas(StatusOS.RECEBIDA);
    permitidas.push(StatusOS.ENTREGUE);
    expect(transicoesPermitidas(StatusOS.RECEBIDA)).not.toContain(StatusOS.ENTREGUE);
  });

  it('prioriza o que está em execução e manda o resto para o fim', () => {
    expect(prioridadeListagem(StatusOS.EM_EXECUCAO)).toBe(0);
    expect(prioridadeListagem(StatusOS.RECEBIDA)).toBe(4);
    expect(prioridadeListagem(StatusOS.CANCELADA)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
