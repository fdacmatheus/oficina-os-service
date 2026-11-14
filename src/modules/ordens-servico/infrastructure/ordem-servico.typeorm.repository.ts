import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { repositorio } from 'src/shared/transacao/typeorm-unidade-de-trabalho';
import { EntradaHistorico, HistoricoOSRepository } from '../domain/historico-os';
import { OrdemServico } from '../domain/ordem-servico.entity';
import { OrdemServicoRepository } from '../domain/ordem-servico.repository';
import { StatusOS } from '../domain/status-os';
import { ItemOSOrmEntity } from './item-os.orm-entity';
import { HistoricoOSOrmEntity, OrdemServicoOrmEntity } from './ordem-servico.orm-entity';

function toDomain(orm: OrdemServicoOrmEntity): OrdemServico {
  return new OrdemServico({
    id: orm.id,
    numero: orm.numero,
    clienteId: orm.clienteId,
    veiculoId: orm.veiculoId,
    status: orm.status,
    itens: (orm.itens ?? []).map((i) => ({
      id: i.id,
      tipo: i.tipo,
      referenciaId: i.referenciaId,
      descricao: i.descricao,
      quantidade: i.quantidade,
      precoUnitario: Number(i.precoUnitario),
    })),
    orcamentoId: orm.orcamentoId,
    valorOrcamento: orm.valorOrcamento === null ? null : Number(orm.valorOrcamento),
    pagamentoId: orm.pagamentoId,
    execucaoId: orm.execucaoId,
    estoqueReservado: orm.estoqueReservado,
    motivoCancelamento: orm.motivoCancelamento,
    recebidaEm: orm.recebidaEm,
    orcamentoGeradoEm: orm.orcamentoGeradoEm,
    aprovadaEm: orm.aprovadaEm,
    pagaEm: orm.pagaEm,
    execucaoIniciadaEm: orm.execucaoIniciadaEm,
    finalizadaEm: orm.finalizadaEm,
    entregueEm: orm.entregueEm,
    canceladaEm: orm.canceladaEm,
    criadoEm: orm.criadoEm,
    atualizadoEm: orm.atualizadoEm,
  });
}

function toOrm(os: OrdemServico): OrdemServicoOrmEntity {
  const orm = new OrdemServicoOrmEntity();
  if (os.id) orm.id = os.id;
  if (os.numero) orm.numero = os.numero;
  orm.clienteId = os.clienteId;
  orm.veiculoId = os.veiculoId;
  orm.status = os.status;
  orm.orcamentoId = os.orcamentoId;
  orm.valorOrcamento = os.valorOrcamento === null ? null : os.valorOrcamento.toFixed(2);
  orm.pagamentoId = os.pagamentoId;
  orm.execucaoId = os.execucaoId;
  orm.estoqueReservado = os.estoqueReservado;
  orm.motivoCancelamento = os.motivoCancelamento;
  orm.recebidaEm = os.recebidaEm;
  orm.orcamentoGeradoEm = os.orcamentoGeradoEm;
  orm.aprovadaEm = os.aprovadaEm;
  orm.pagaEm = os.pagaEm;
  orm.execucaoIniciadaEm = os.execucaoIniciadaEm;
  orm.finalizadaEm = os.finalizadaEm;
  orm.entregueEm = os.entregueEm;
  orm.canceladaEm = os.canceladaEm;
  orm.criadoEm = os.criadoEm;
  orm.atualizadoEm = os.atualizadoEm;
  orm.itens = os.itens.map((i) => {
    const item = new ItemOSOrmEntity();
    if (i.id) item.id = i.id;
    item.tipo = i.tipo;
    item.referenciaId = i.referenciaId;
    item.descricao = i.descricao;
    item.quantidade = i.quantidade;
    item.precoUnitario = i.precoUnitario.toFixed(2);
    return item;
  });
  return orm;
}

@Injectable()
export class OrdemServicoTypeOrmRepository implements OrdemServicoRepository {
  constructor(private readonly dataSource: DataSource) {}

  private get repo(): Repository<OrdemServicoOrmEntity> {
    return repositorio(this.dataSource, OrdemServicoOrmEntity);
  }

  async create(os: OrdemServico): Promise<OrdemServico> {
    return toDomain(await this.repo.save(toOrm(os)));
  }

  async update(os: OrdemServico): Promise<OrdemServico> {
    return toDomain(await this.repo.save(toOrm(os)));
  }

  async findById(id: string): Promise<OrdemServico | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? toDomain(orm) : null;
  }

  async findByIdParaAtualizar(id: string): Promise<OrdemServico | null> {
    // O lock vai numa consulta sem join: o Postgres não aceita FOR UPDATE no
    // lado opcional do LEFT JOIN que a relação eager dos itens gera.
    const bloqueada = await this.repo
      .createQueryBuilder('os')
      .select('os.id')
      .where('os.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    return bloqueada ? this.findById(id) : null;
  }

  async findByNumero(numero: number): Promise<OrdemServico | null> {
    const orm = await this.repo.findOne({ where: { numero } });
    return orm ? toDomain(orm) : null;
  }

  async findAll(filtro?: { status?: StatusOS; clienteId?: string }): Promise<OrdemServico[]> {
    const list = await this.repo.find({ where: filtro, order: { criadoEm: 'DESC' } });
    return list.map(toDomain);
  }

  async tempoMedioExecucaoMs(): Promise<number | null> {
    const result = await this.repo
      .createQueryBuilder('os')
      .select('AVG(os.finalizada_em - os.execucao_iniciada_em)', 'media')
      .where('os.execucao_iniciada_em IS NOT NULL')
      .andWhere('os.finalizada_em IS NOT NULL')
      .getRawOne<{ media: string | null }>();
    return result?.media ? Math.round(Number(result.media)) : null;
  }
}

@Injectable()
export class HistoricoOSTypeOrmRepository implements HistoricoOSRepository {
  constructor(private readonly dataSource: DataSource) {}

  async registrar(entrada: EntradaHistorico): Promise<void> {
    await repositorio(this.dataSource, HistoricoOSOrmEntity).insert({
      osId: entrada.osId,
      evento: entrada.evento,
      statusAnterior: entrada.statusAnterior,
      statusNovo: entrada.statusNovo,
      detalhe: entrada.detalhe ?? null,
      em: entrada.em,
    });
  }

  async listar(osId: string): Promise<EntradaHistorico[]> {
    const linhas = await repositorio(this.dataSource, HistoricoOSOrmEntity).find({
      where: { osId },
      order: { em: 'ASC' },
    });
    return linhas.map((l) => ({
      osId: l.osId,
      evento: l.evento,
      statusAnterior: l.statusAnterior,
      statusNovo: l.statusNovo,
      detalhe: l.detalhe,
      em: l.em,
    }));
  }
}
