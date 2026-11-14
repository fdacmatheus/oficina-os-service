import { EntradaHistorico } from '../domain/historico-os';
import { OrdemServico } from '../domain/ordem-servico.entity';

/** Datas saem como Unix epoch em milissegundos, como em todo o sistema. */
export class OrdemServicoPresenter {
  static detail(os: OrdemServico) {
    return {
      id: os.id,
      numero: os.numero,
      clienteId: os.clienteId,
      veiculoId: os.veiculoId,
      status: os.status,
      itens: os.itens.map((i) => ({
        id: i.id,
        tipo: i.tipo,
        referenciaId: i.referenciaId,
        descricao: i.descricao,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        subtotal: i.subtotal,
      })),
      totalItens: os.totalItens,
      saga: {
        orcamentoId: os.orcamentoId,
        valorOrcamento: os.valorOrcamento,
        pagamentoId: os.pagamentoId,
        execucaoId: os.execucaoId,
        estoqueReservado: os.estoqueReservado,
        motivoCancelamento: os.motivoCancelamento,
      },
      tempoExecucaoMs: os.tempoExecucaoMs,
      datas: OrdemServicoPresenter.datas(os),
    };
  }

  static summary(os: OrdemServico) {
    return {
      id: os.id,
      numero: os.numero,
      clienteId: os.clienteId,
      veiculoId: os.veiculoId,
      status: os.status,
      valorOrcamento: os.valorOrcamento,
      recebidaEm: os.recebidaEm,
    };
  }

  static publico(os: OrdemServico, historico: EntradaHistorico[]) {
    return {
      numero: os.numero,
      status: os.status,
      valorOrcamento: os.valorOrcamento,
      motivoCancelamento: os.motivoCancelamento,
      datas: OrdemServicoPresenter.datas(os),
      historico: OrdemServicoPresenter.historico(historico),
    };
  }

  static historico(historico: EntradaHistorico[]) {
    return historico.map((h) => ({
      evento: h.evento,
      statusAnterior: h.statusAnterior,
      statusNovo: h.statusNovo,
      detalhe: h.detalhe ?? null,
      em: h.em,
    }));
  }

  private static datas(os: OrdemServico) {
    return {
      recebidaEm: os.recebidaEm,
      orcamentoGeradoEm: os.orcamentoGeradoEm,
      aprovadaEm: os.aprovadaEm,
      pagaEm: os.pagaEm,
      execucaoIniciadaEm: os.execucaoIniciadaEm,
      finalizadaEm: os.finalizadaEm,
      entregueEm: os.entregueEm,
      canceladaEm: os.canceladaEm,
      atualizadoEm: os.atualizadoEm,
    };
  }
}
