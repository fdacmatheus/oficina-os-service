import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MANIPULADOR_MENSAGEM } from 'src/shared/mensageria/mensageria.port';
import { SqsConsumidorService } from 'src/shared/mensageria/sqs-consumidor.service';
import { ClientesModule } from '../clientes/clientes.module';
import { PecasModule } from '../pecas/pecas.module';
import { ServicosModule } from '../servicos/servicos.module';
import { VeiculosModule } from '../veiculos/veiculos.module';
import { NOTIFICACAO_PORT } from './application/notificacao.port';
import { OrdensServicoService } from './application/ordens-servico.service';
import { SagaOrdemServicoService } from './application/saga-ordem-servico.service';
import { HISTORICO_OS_REPOSITORY } from './domain/historico-os';
import { ORDEM_SERVICO_REPOSITORY } from './domain/ordem-servico.repository';
import { EmailNotificacaoAdapter } from './infrastructure/email-notificacao.adapter';
import { ItemOSOrmEntity } from './infrastructure/item-os.orm-entity';
import {
  HistoricoOSOrmEntity,
  OrdemServicoOrmEntity,
} from './infrastructure/ordem-servico.orm-entity';
import {
  HistoricoOSTypeOrmRepository,
  OrdemServicoTypeOrmRepository,
} from './infrastructure/ordem-servico.typeorm.repository';
import { OrdensServicoPublicoController } from './presentation/ordens-servico-publico.controller';
import { OrdensServicoController } from './presentation/ordens-servico.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrdemServicoOrmEntity, ItemOSOrmEntity, HistoricoOSOrmEntity]),
    ClientesModule,
    VeiculosModule,
    ServicosModule,
    PecasModule,
  ],
  controllers: [OrdensServicoController, OrdensServicoPublicoController],
  providers: [
    OrdensServicoService,
    SagaOrdemServicoService,
    { provide: MANIPULADOR_MENSAGEM, useExisting: SagaOrdemServicoService },
    SqsConsumidorService,
    { provide: ORDEM_SERVICO_REPOSITORY, useClass: OrdemServicoTypeOrmRepository },
    { provide: HISTORICO_OS_REPOSITORY, useClass: HistoricoOSTypeOrmRepository },
    { provide: NOTIFICACAO_PORT, useClass: EmailNotificacaoAdapter },
  ],
  exports: [OrdensServicoService],
})
export class OrdensServicoModule {}
