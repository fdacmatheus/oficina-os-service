export interface UserProps {
  id?: string;
  username: string;
  passwordHash: string;
  criadoEm?: number;
  atualizadoEm?: number;
}

export class User {
  readonly id?: string;
  username: string;
  passwordHash: string;
  readonly criadoEm: number;
  atualizadoEm: number;

  constructor(props: UserProps) {
    if (!props.username || props.username.trim().length < 3) {
      throw new Error('Username deve ter ao menos 3 caracteres');
    }
    if (!props.passwordHash) {
      throw new Error('passwordHash é obrigatório');
    }
    this.id = props.id;
    this.username = props.username.trim().toLowerCase();
    this.passwordHash = props.passwordHash;
    this.criadoEm = props.criadoEm ?? Date.now();
    this.atualizadoEm = props.atualizadoEm ?? Date.now();
  }
}
