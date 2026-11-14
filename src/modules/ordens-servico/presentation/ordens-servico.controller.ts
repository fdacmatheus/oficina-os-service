import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/presentation/jwt-auth.guard';
import { OrdensServicoService } from '../application/ordens-servico.service';
import { StatusOS } from '../domain/status-os';
import { CancelarOrdemServicoDto } from './dto/cancelar-ordem-servico.dto';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { OrdemServicoPresenter } from './ordem-servico.presenter';

@ApiTags('ordens-servico')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ordens-servico')
export class OrdensServicoController {
  constructor(private readonly service: OrdensServicoService) {}

  @Post()
  @ApiOperation({
    summary: 'Abre a OS e inicia a saga (o billing recebe o comando GerarOrcamento)',
  })
  async create(@Body() dto: CreateOrdemServicoDto) {
    return OrdemServicoPresenter.detail(await this.service.create(dto));
  }

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: StatusOS })
  @ApiQuery({ name: 'clienteId', required: false, type: String })
  async findAll(@Query('status') status?: StatusOS, @Query('clienteId') clienteId?: string) {
    const list = await this.service.findAll({ status, clienteId });
    return list.map((os) => OrdemServicoPresenter.summary(os));
  }

  @Get('tempo-medio-execucao')
  @ApiOperation({ summary: 'Tempo médio de execução (ms) entre o início e a finalização' })
  async tempoMedio() {
    return { tempoMedioMs: await this.service.tempoMedioExecucaoMs() };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return OrdemServicoPresenter.detail(await this.service.findById(id));
  }

  @Get(':id/historico')
  @ApiOperation({ summary: 'Linha do tempo da OS: cada evento da saga e o status resultante' })
  async historico(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.findById(id);
    return OrdemServicoPresenter.historico(await this.service.historicoDe(id));
  }

  @Patch(':id/entregar')
  @ApiOperation({ summary: 'Registra a entrega do veículo (OS finalizada → entregue)' })
  async entregar(@Param('id', ParseUUIDPipe) id: string) {
    return OrdemServicoPresenter.detail(await this.service.entregar(id));
  }

  @Patch(':id/cancelar')
  @ApiOperation({
    summary:
      'Cancela a OS e dispara as compensações do estado atual (estoque, orçamento, estorno, execução)',
  })
  async cancelar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelarOrdemServicoDto) {
    return OrdemServicoPresenter.detail(await this.service.cancelar(id, dto.motivo));
  }
}
