import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Protege rotas chamadas só por outros componentes da plataforma (hoje, a
 * Lambda de autenticação), nunca pelo usuário. A chave vem do Secrets Manager
 * da plataforma; sem ela configurada, a rota fica fechada.
 */
@Injectable()
export class ChaveInternaGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(contexto: ExecutionContext): boolean {
    const esperada = this.config.get<string>('INTERNAL_API_KEY');
    const recebida = contexto.switchToHttp().getRequest<Request>().headers['x-chave-interna'];
    if (!esperada || typeof recebida !== 'string') throw new UnauthorizedException();

    const a = Buffer.from(recebida);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}
