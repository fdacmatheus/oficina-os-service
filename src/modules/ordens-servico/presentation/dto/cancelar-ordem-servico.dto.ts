import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelarOrdemServicoDto {
  @ApiPropertyOptional({ example: 'Cliente desistiu do serviço' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}
