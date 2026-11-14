import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { OrdemServico } from '../domain/ordem-servico.entity';
import { StatusOS } from '../domain/status-os';
import { EmailNotificacaoAdapter } from './email-notificacao.adapter';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('EmailNotificacaoAdapter', () => {
  const sendMail = jest.fn().mockResolvedValue(undefined);
  (createTransport as jest.Mock).mockReturnValue({ sendMail });

  const config = (valores: Record<string, unknown>) =>
    ({ get: (k: string, padrao?: unknown) => valores[k] ?? padrao }) as unknown as ConfigService;

  beforeEach(() => sendMail.mockClear());

  it('envia o link de aprovação e o valor do orçamento', async () => {
    const adapter = new EmailNotificacaoAdapter(config({ SMTP_FROM: 'oficina@x.com' }));
    const os = new OrdemServico({
      numero: 3,
      clienteId: 'c',
      veiculoId: 'v',
      status: StatusOS.AGUARDANDO_APROVACAO,
      valorOrcamento: 310,
    });
    await adapter.notificarMudancaStatus(os, 'joao@x.com', { linkAprovacao: 'http://link' });
    const mail = sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({ from: 'oficina@x.com', to: 'joao@x.com' });
    expect(mail.subject).toContain('aguardando sua aprovação');
    expect(mail.text).toContain('R$ 310.00');
    expect(mail.text).toContain('http://link');
  });

  it('inclui o motivo do cancelamento e usa o status cru quando não há descrição', async () => {
    const adapter = new EmailNotificacaoAdapter(config({ SMTP_USER: 'u', SMTP_PASSWORD: 'p' }));
    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ auth: { user: 'u', pass: 'p' } }),
    );
    const os = new OrdemServico({
      numero: 4,
      clienteId: 'c',
      veiculoId: 'v',
      status: StatusOS.CANCELADA,
      motivoCancelamento: 'PAGAMENTO_RECUSADO',
    });
    await adapter.notificarMudancaStatus(os, 'a@x.com');
    expect(sendMail.mock.calls[0][0].text).toContain('Motivo: PAGAMENTO_RECUSADO');
    expect(sendMail.mock.calls[0][0].text).not.toContain('Orçamento:');

    os.status = 'DESCONHECIDO' as StatusOS;
    await adapter.notificarMudancaStatus(os, 'a@x.com');
    expect(sendMail.mock.calls[1][0].subject).toContain('DESCONHECIDO');
  });

  it('não envia nada se o cliente não tem e-mail', async () => {
    const adapter = new EmailNotificacaoAdapter(config({}));
    await adapter.notificarMudancaStatus(
      new OrdemServico({ clienteId: 'c', veiculoId: 'v' }),
      null,
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});
