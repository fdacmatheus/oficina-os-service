import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { OrdemServico } from '../domain/ordem-servico.entity';
import { NotificacaoPort } from '../application/notificacao.port';

const DESCRICAO_STATUS: Record<string, string> = {
  RECEBIDA: 'Recebida',
  AGUARDANDO_APROVACAO: 'Orçamento pronto, aguardando sua aprovação',
  AGUARDANDO_PAGAMENTO: 'Orçamento aprovado, aguardando pagamento',
  AGUARDANDO_EXECUCAO: 'Pagamento confirmado, aguardando a oficina',
  EM_EXECUCAO: 'Em execução',
  FINALIZADA: 'Finalizada',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

@Injectable()
export class EmailNotificacaoAdapter implements NotificacaoPort {
  private readonly logger = new Logger(EmailNotificacaoAdapter.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from = config.get<string>('SMTP_FROM', 'oficina@oficina.com');
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      port: config.get<number>('SMTP_PORT', 1025),
      secure: false,
      auth: config.get<string>('SMTP_USER')
        ? {
            user: config.get<string>('SMTP_USER'),
            pass: config.get<string>('SMTP_PASSWORD'),
          }
        : undefined,
    });
  }

  async notificarMudancaStatus(
    os: OrdemServico,
    emailCliente: string | null,
    extra?: { linkAprovacao?: string },
  ): Promise<void> {
    if (!emailCliente) {
      this.logger.warn(`OS ${os.numero}: cliente sem e-mail cadastrado, notificação ignorada`);
      return;
    }

    const statusLegivel = DESCRICAO_STATUS[os.status] ?? os.status;
    await this.transporter.sendMail({
      from: this.from,
      to: emailCliente,
      subject: `Oficina — OS #${os.numero}: ${statusLegivel}`,
      text: [
        `Olá!`,
        ``,
        `Sua ordem de serviço #${os.numero} mudou de situação: ${statusLegivel}.`,
        ...(os.valorOrcamento !== null ? [`Orçamento: R$ ${os.valorOrcamento.toFixed(2)}`] : []),
        ...(extra?.linkAprovacao
          ? [``, `Veja, aprove ou recuse o orçamento e pague por aqui: ${extra.linkAprovacao}`]
          : []),
        ...(os.motivoCancelamento ? [`Motivo: ${os.motivoCancelamento}`] : []),
        ``,
        `Acompanhe pelo endpoint público: /api/publico/ordens-servico/${os.numero}`,
      ].join('\n'),
    });
    this.logger.log(`OS ${os.numero}: e-mail de status enviado para ${emailCliente}`);
  }
}
