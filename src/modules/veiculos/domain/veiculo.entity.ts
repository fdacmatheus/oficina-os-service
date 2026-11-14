import { isValidPlaca } from 'src/shared/validators/placa.validator';

export interface VeiculoProps {
  id?: string;
  clienteId: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  criadoEm?: number;
  atualizadoEm?: number;
}

export class Veiculo {
  readonly id?: string;
  clienteId: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  readonly criadoEm: number;
  atualizadoEm: number;

  constructor(props: VeiculoProps) {
    if (!props.clienteId) {
      throw new Error('clienteId é obrigatório');
    }
    if (!isValidPlaca(props.placa)) {
      throw new Error('Placa inválida');
    }
    if (!props.marca || props.marca.trim().length < 1) {
      throw new Error('Marca é obrigatória');
    }
    if (!props.modelo || props.modelo.trim().length < 1) {
      throw new Error('Modelo é obrigatório');
    }
    const anoAtual = new Date().getFullYear();
    if (!Number.isInteger(props.ano) || props.ano < 1900 || props.ano > anoAtual + 1) {
      throw new Error(`Ano deve estar entre 1900 e ${anoAtual + 1}`);
    }

    this.id = props.id;
    this.clienteId = props.clienteId;
    this.placa = props.placa.toUpperCase().replace(/[\s-]/g, '');
    this.marca = props.marca.trim();
    this.modelo = props.modelo.trim();
    this.ano = props.ano;
    this.criadoEm = props.criadoEm ?? Date.now();
    this.atualizadoEm = props.atualizadoEm ?? Date.now();
  }
}
