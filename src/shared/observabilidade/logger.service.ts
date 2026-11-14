import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api';
import { obterCorrelationId } from './correlacao.middleware';

type Nivel = 'debug' | 'info' | 'warn' | 'error';

const SEVERIDADE: Record<Nivel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

/**
 * Logger em JSON estruturado, exigido pelo requisito de observabilidade.
 *
 * Em desenvolvimento o formato volta a ser texto legivel; em producao toda linha
 * sai como um objeto JSON com o correlationId da requisicao em curso.
 */
@Injectable({ scope: Scope.DEFAULT })
export class LoggerService implements NestLoggerService {
  private readonly json = process.env.LOG_FORMAT === 'json';
  private readonly servico = 'oficina-os-service';

  private readonly otel = logs.getLogger('oficina-os-service');

  private emitir(nivel: Nivel, mensagem: unknown, contexto?: string, extra?: unknown): void {
    const correlationId = obterCorrelationId();
    const texto = typeof mensagem === 'string' ? mensagem : JSON.stringify(mensagem);

    // Vai também para o Loki via OTLP, já com trace_id e span_id do span ativo.
    // Sem SDK registrado (testes) o logger do OTel é no-op.
    this.otel.emit({
      severityNumber: SEVERIDADE[nivel],
      severityText: nivel.toUpperCase(),
      body: texto,
      attributes: {
        ...(contexto ? { contexto } : {}),
        ...(correlationId ? { correlationId } : {}),
        ...(extra ? { detalhe: String(extra) } : {}),
      },
    });

    if (!this.json) {
      const prefixo = contexto ? `[${contexto}] ` : '';
      const sufixo = correlationId ? ` (${correlationId})` : '';
      const linha = `${nivel.toUpperCase()} ${prefixo}${String(mensagem)}${sufixo}`;
      if (nivel === 'error') {
        console.error(extra ? `${linha}\n${String(extra)}` : linha);
        return;
      }
      console.log(linha);
      return;
    }

    const linha = JSON.stringify({
      timestamp: Date.now(),
      nivel,
      servico: this.servico,
      contexto,
      correlationId,
      mensagem: texto,
      ...(extra ? { detalhe: extra } : {}),
    });

    if (nivel === 'error') {
      console.error(linha);
      return;
    }

    console.log(linha);
  }

  log(mensagem: unknown, contexto?: string): void {
    this.emitir('info', mensagem, contexto);
  }

  error(mensagem: unknown, trace?: string, contexto?: string): void {
    this.emitir('error', mensagem, contexto, trace);
  }

  warn(mensagem: unknown, contexto?: string): void {
    this.emitir('warn', mensagem, contexto);
  }

  debug(mensagem: unknown, contexto?: string): void {
    this.emitir('debug', mensagem, contexto);
  }

  verbose(mensagem: unknown, contexto?: string): void {
    this.emitir('debug', mensagem, contexto);
  }
}
