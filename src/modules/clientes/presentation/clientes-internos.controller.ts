import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ClientesService } from '../application/clientes.service';
import { ChaveInternaGuard } from './chave-interna.guard';

/**
 * Consulta usada pela Lambda de autenticação para emitir o token por CPF.
 * Substitui a leitura direta da tabela que a Lambda fazia na fase 3: agora
 * nenhum componente acessa o banco do os-service.
 */
@ApiExcludeController()
@UseGuards(ChaveInternaGuard)
@Controller('internos/clientes')
export class ClientesInternosController {
  constructor(private readonly service: ClientesService) {}

  @Get('documento/:documento')
  async porDocumento(@Param('documento') documento: string) {
    const cliente = await this.service.findByDocumento(documento);
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return {
      id: cliente.id,
      nome: cliente.nome,
      documento: cliente.documento,
      email: cliente.email,
    };
  }
}
