import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientesService } from 'src/modules/clientes/application/clientes.service';
import { PecasService } from 'src/modules/pecas/application/pecas.service';
import { ServicosService } from 'src/modules/servicos/application/servicos.service';
import { VeiculosService } from 'src/modules/veiculos/application/veiculos.service';
import { MetricasService } from 'src/shared/observabilidade/metricas.service';
import { UNIDADE_DE_TRABALHO, UnidadeDeTrabalho } from 'src/shared/transacao/unidade-de-trabalho';
import {
  EntradaHistorico,
  HISTORICO_OS_REPOSITORY,
  HistoricoOSRepository,
} from '../domain/historico-os';
import { OrdemServico } from '../domain/ordem-servico.entity';
import {
  ORDEM_SERVICO_REPOSITORY,
  OrdemServicoRepository,
} from '../domain/ordem-servico.repository';
import { prioridadeListagem, STATUS_OCULTOS_NA_LISTAGEM, StatusOS } from '../domain/status-os';
import { SagaOrdemServicoService } from './saga-ordem-servico.service';

export interface CreateOrdemServicoInput {
  clienteId: string;
  veiculoId: string;
  servicos?: { servicoId: string; quantidade?: number }[];
  pecas?: { pecaId: string; quantidade: number }[];
}

@Injectable()
export class OrdensServicoService {
  constructor(
    @Inject(ORDEM_SERVICO_REPOSITORY) private readonly repository: OrdemServicoRepository,
    @Inject(HISTORICO_OS_REPOSITORY) private readonly historico: HistoricoOSRepository,
    @Inject(UNIDADE_DE_TRABALHO) private readonly uow: UnidadeDeTrabalho,
    private readonly saga: SagaOrdemServicoService,
    private readonly clientes: ClientesService,
    private readonly veiculos: VeiculosService,
    private readonly servicos: ServicosService,
    private readonly pecas: PecasService,
    private readonly metricas: MetricasService,
  ) {}

  /** Abre a OS e inicia a saga: a OS e o comando GerarOrcamento são gravados juntos. */
  async create(input: CreateOrdemServicoInput): Promise<OrdemServico> {
    await this.clientes.findById(input.clienteId);
    const veiculo = await this.veiculos.findById(input.veiculoId);
    if (veiculo.clienteId !== input.clienteId) {
      throw new BadRequestException('Veículo não pertence ao cliente informado');
    }
    if (!input.servicos?.length && !input.pecas?.length) {
      throw new BadRequestException('Informe ao menos um serviço ou peça');
    }

    const os = new OrdemServico({ clienteId: input.clienteId, veiculoId: input.veiculoId });

    for (const s of input.servicos ?? []) {
      const servico = await this.servicos.findById(s.servicoId);
      os.adicionarItem({
        tipo: 'SERVICO',
        referenciaId: servico.id as string,
        descricao: servico.nome,
        quantidade: s.quantidade ?? 1,
        precoUnitario: servico.preco,
      });
    }
    for (const p of input.pecas ?? []) {
      const peca = await this.pecas.findById(p.pecaId);
      os.adicionarItem({
        tipo: 'PECA',
        referenciaId: peca.id as string,
        descricao: peca.nome,
        quantidade: p.quantidade,
        precoUnitario: peca.precoUnitario,
      });
    }

    try {
      const criada = await this.uow.executar(async () => {
        const salva = await this.repository.create(os);
        await this.saga.iniciar(salva);
        return salva;
      });
      this.metricas.ordensCriadas.inc();
      this.metricas.transicoes.inc({ de: 'NENHUM', para: criada.status });
      return criada;
    } catch (err) {
      this.metricas.errosOrdemServico.inc({ operacao: 'criar' });
      throw err;
    }
  }

  async findAll(filtro?: { status?: StatusOS; clienteId?: string }): Promise<OrdemServico[]> {
    const list = await this.repository.findAll(filtro);
    const visiveis = filtro?.status
      ? list
      : list.filter((os) => !STATUS_OCULTOS_NA_LISTAGEM.includes(os.status));
    return visiveis.sort(
      (a, b) =>
        prioridadeListagem(a.status) - prioridadeListagem(b.status) || a.recebidaEm - b.recebidaEm,
    );
  }

  async findById(id: string): Promise<OrdemServico> {
    const os = await this.repository.findById(id);
    if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
    return os;
  }

  async findByNumero(numero: number): Promise<OrdemServico> {
    const os = await this.repository.findByNumero(numero);
    if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
    return os;
  }

  async historicoDe(id: string): Promise<EntradaHistorico[]> {
    return this.historico.listar(id);
  }

  async entregar(id: string): Promise<OrdemServico> {
    return this.uow.executar(async () => {
      const os = await this.repository.findByIdParaAtualizar(id);
      if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
      const anterior = os.status;
      this.tryDomain(() => os.entregar());
      await this.historico.registrar({
        osId: id,
        evento: 'Entregue',
        statusAnterior: anterior,
        statusNovo: os.status,
        em: Date.now(),
      });
      this.metricas.transicoes.inc({ de: anterior, para: os.status });
      return this.repository.update(os);
    });
  }

  async cancelar(id: string, motivo?: string): Promise<OrdemServico> {
    let os: OrdemServico | null = null;
    try {
      os = await this.saga.cancelarPelaOficina(id, motivo);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
    return os;
  }

  async tempoMedioExecucaoMs(): Promise<number | null> {
    return this.repository.tempoMedioExecucaoMs();
  }

  private tryDomain(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
