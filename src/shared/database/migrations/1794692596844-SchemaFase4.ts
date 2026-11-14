import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchemaFase41794692596844 implements MigrationInterface {
  name = 'SchemaFase41794692596844';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "outbox" ("id" uuid NOT NULL, "tipo" character varying(60) NOT NULL, "fila_destino" character varying(60) NOT NULL, "corpo" jsonb NOT NULL, "correlation_id" character varying(60) NOT NULL, "criada_em" bigint NOT NULL, "publicada_em" bigint, CONSTRAINT "PK_340ab539f309f03bdaa14aa7649" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_pendentes" ON "outbox" ("criada_em") WHERE publicada_em IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "mensagens_processadas" ("message_id" uuid NOT NULL, "tipo" character varying(60) NOT NULL, "processada_em" bigint NOT NULL, CONSTRAINT "PK_f5c815a056490ce9fc5cde871bb" PRIMARY KEY ("message_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "veiculos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cliente_id" uuid NOT NULL, "placa" character varying(8) NOT NULL, "marca" character varying(40) NOT NULL, "modelo" character varying(60) NOT NULL, "ano" integer NOT NULL, "criado_em" bigint NOT NULL, "atualizado_em" bigint NOT NULL, CONSTRAINT "UQ_3c7f2de70c4765a04c070a9f745" UNIQUE ("placa"), CONSTRAINT "PK_0c3daa1e5d16914bd9e7777cf77" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_81a93b6a6fd4fad983662608de" ON "veiculos" ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "servicos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nome" character varying(120) NOT NULL, "descricao" text, "preco" numeric(10,2) NOT NULL, "duracao_estimada_minutos" integer NOT NULL, "ativo" boolean NOT NULL DEFAULT true, "criado_em" bigint NOT NULL, "atualizado_em" bigint NOT NULL, CONSTRAINT "PK_91c99670ea2115d2028a48c5e0e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "pecas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sku" character varying(40) NOT NULL, "nome" character varying(120) NOT NULL, "descricao" text, "preco_unitario" numeric(10,2) NOT NULL, "estoque" integer NOT NULL DEFAULT '0', "estoque_minimo" integer NOT NULL DEFAULT '0', "ativo" boolean NOT NULL DEFAULT true, "criado_em" bigint NOT NULL, "atualizado_em" bigint NOT NULL, CONSTRAINT "UQ_ef09b801cf49bc78502d9e362b3" UNIQUE ("sku"), CONSTRAINT "PK_831c0fc9b2138f6b2a9a447bc78" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "os_itens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ordem_servico_id" uuid NOT NULL, "tipo" character varying(10) NOT NULL, "referencia_id" uuid NOT NULL, "descricao" character varying(200) NOT NULL, "quantidade" integer NOT NULL, "preco_unitario" numeric(10,2) NOT NULL, CONSTRAINT "PK_a67392d863658e9b6e939e9be4c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "ordens_servico" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "numero" SERIAL NOT NULL, "cliente_id" uuid NOT NULL, "veiculo_id" uuid NOT NULL, "status" character varying(30) NOT NULL DEFAULT 'RECEBIDA', "orcamento_id" character varying(60), "valor_orcamento" numeric(10,2), "pagamento_id" character varying(60), "execucao_id" character varying(60), "estoque_reservado" boolean NOT NULL DEFAULT false, "motivo_cancelamento" character varying(200), "recebida_em" bigint NOT NULL, "orcamento_gerado_em" bigint, "aprovada_em" bigint, "paga_em" bigint, "execucao_iniciada_em" bigint, "finalizada_em" bigint, "entregue_em" bigint, "cancelada_em" bigint, "criado_em" bigint NOT NULL, "atualizado_em" bigint NOT NULL, CONSTRAINT "UQ_8b331ce2bd7f6dc359db37bbcc8" UNIQUE ("numero"), CONSTRAINT "PK_7e88933ca1acb36785ccb55a34c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f3888ffa68910189ba40bbfbfb" ON "ordens_servico" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb8bf59e44e8e3b1e7ecd35f14" ON "ordens_servico" ("veiculo_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a5c1898de4fdc916a2c3d2f837" ON "ordens_servico" ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "os_historico" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "os_id" uuid NOT NULL, "evento" character varying(60) NOT NULL, "status_anterior" character varying(30), "status_novo" character varying(30) NOT NULL, "detalhe" character varying(300), "em" bigint NOT NULL, CONSTRAINT "PK_615fc94b62947ecd7cfbca8eaee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2f41c294e167c5ce866bcd2d13" ON "os_historico" ("os_id", "em") `,
    );
    await queryRunner.query(
      `CREATE TABLE "clientes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nome" character varying(120) NOT NULL, "documento" character varying(14) NOT NULL, "email" character varying(120), "telefone" character varying(30), "criado_em" bigint NOT NULL, "atualizado_em" bigint NOT NULL, CONSTRAINT "UQ_fc002853c86bd15f82ef93bf42a" UNIQUE ("documento"), CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(60) NOT NULL, "password_hash" character varying(100) NOT NULL, "criado_em" bigint NOT NULL, "atualizado_em" bigint NOT NULL, CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "os_itens" ADD CONSTRAINT "FK_fa38c0c51b5d16f9651690ba087" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "os_itens" DROP CONSTRAINT "FK_fa38c0c51b5d16f9651690ba087"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "clientes"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2f41c294e167c5ce866bcd2d13"`);
    await queryRunner.query(`DROP TABLE "os_historico"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a5c1898de4fdc916a2c3d2f837"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fb8bf59e44e8e3b1e7ecd35f14"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f3888ffa68910189ba40bbfbfb"`);
    await queryRunner.query(`DROP TABLE "ordens_servico"`);
    await queryRunner.query(`DROP TABLE "os_itens"`);
    await queryRunner.query(`DROP TABLE "pecas"`);
    await queryRunner.query(`DROP TABLE "servicos"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_81a93b6a6fd4fad983662608de"`);
    await queryRunner.query(`DROP TABLE "veiculos"`);
    await queryRunner.query(`DROP TABLE "mensagens_processadas"`);
    await queryRunner.query(`DROP INDEX "public"."idx_outbox_pendentes"`);
    await queryRunner.query(`DROP TABLE "outbox"`);
  }
}
