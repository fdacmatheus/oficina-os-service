# Contrato de mensagens · Fase 4

Fonte única do formato das mensagens trocadas entre os serviços. Cada repositório copia os tipos que usa; mudar aqui primeiro.

## Transporte

- Amazon SQS (Floci em `http://localhost:4566` no ambiente local, região `us-east-1`, credenciais `test`/`test`).
- Uma fila de **entrada** por serviço, criada pelo Terraform do próprio serviço, cada uma com DLQ (`maxReceiveCount = 5`):

| Fila | Dono (consome) | Quem publica |
|---|---|---|
| `os-eventos` (+ `os-eventos-dlq`) | os-service | billing, execution |
| `billing-comandos` (+ `billing-comandos-dlq`) | billing-service | os-service |
| `execution-comandos` (+ `execution-comandos-dlq`) | execution-service | os-service |

- Entrega *at least once*: todo consumidor é idempotente por `messageId`.
- Publicação via **outbox**: o estado e a mensagem são gravados na mesma transação local; um publicador envia depois.
- A mensagem só é apagada da fila depois de processada com sucesso. Erro → não apaga → volta após o visibility timeout → após 5 tentativas vai para a DLQ.

## Envelope (corpo da mensagem SQS, JSON)

```json
{
  "messageId": "uuid v4",
  "type": "GerarOrcamento",
  "correlationId": "<osId>",
  "occurredAt": 1763121600000,
  "source": "os-service",
  "payload": { }
}
```

Também vai como *message attribute* SQS: `type` e `correlationId` (String), para filtrar e logar sem abrir o corpo.

`correlationId` é sempre o **id da OS**. Todo log JSON relacionado à mensagem inclui `correlationId`.

Valores monetários: `number` em reais com 2 casas (ex.: `350.5`).

## Datas: Unix epoch em milissegundos, em todo lugar

Toda data é um `number` inteiro com milissegundos desde 1970-01-01 UTC (o mesmo que `Date.now()`), por exemplo `1763121600000`. Vale para:

- mensagens (`occurredAt` e qualquer data em payload);
- requisições e respostas HTTP;
- DynamoDB (atributo `N`; chaves de ordenação usam o número com zeros à esquerda até 13 dígitos, ex. `gsi1sk = 1763121600000#<osId>`);
- Postgres: colunas `bigint` (nunca `timestamp`/`timestamptz`). No TypeORM, use um transformer que converta a string do driver em `number`; não use `CreateDateColumn`/`UpdateDateColumn` — preencha com `Date.now()` no código.
- Domínio: campos de data são `number` (ms), não `Date`.

Nomes de campos de data terminam em `Em` (ex.: `criadoEm`, `enfileiradaEm`).

## Comandos para o billing-service (`billing-comandos`)

| type | payload |
|---|---|
| `GerarOrcamento` | `{ osId, osNumero, cliente: { id, nome, email, documento }, itens: [{ tipo: "SERVICO" \| "PECA", referenciaId, descricao, quantidade, precoUnitario }] }` |
| `CobrarOrcamento` | `{ osId, orcamentoId }` |
| `CancelarOrcamento` | `{ osId, orcamentoId, motivo }` |
| `EstornarPagamento` | `{ osId, pagamentoId, motivo }` |

## Comandos para o execution-service (`execution-comandos`)

| type | payload |
|---|---|
| `AgendarExecucao` | `{ osId, osNumero, veiculo: { placa, marca, modelo }, itens: [{ tipo, descricao, quantidade }] }` |
| `CancelarExecucao` | `{ osId, motivo }` |

## Eventos para o os-service (`os-eventos`)

Publicados pelo billing:

| type | payload |
|---|---|
| `OrcamentoGerado` | `{ osId, orcamentoId, valorTotal, linkAprovacao }` |
| `OrcamentoAprovado` | `{ osId, orcamentoId }` |
| `OrcamentoRecusado` | `{ osId, orcamentoId }` |
| `OrcamentoCancelado` | `{ osId, orcamentoId }` |
| `PagamentoAprovado` | `{ osId, orcamentoId, pagamentoId, valor }` |
| `PagamentoRecusado` | `{ osId, orcamentoId, pagamentoId, motivo }` |
| `PagamentoEstornado` | `{ osId, pagamentoId }` |

Publicados pelo execution:

| type | payload |
|---|---|
| `ExecucaoAgendada` | `{ osId, execucaoId, posicaoNaFila }` |
| `ExecucaoAtualizada` | `{ osId, execucaoId, etapa: "EM_DIAGNOSTICO" \| "EM_REPARO", observacao? }` |
| `ExecucaoFinalizada` | `{ osId, execucaoId }` |
| `ExecucaoFalhou` | `{ osId, execucaoId, motivo }` |
| `ExecucaoCancelada` | `{ osId, execucaoId }` |

## Estados da OS (os-service)

```
RECEBIDA → AGUARDANDO_APROVACAO → AGUARDANDO_PAGAMENTO → AGUARDANDO_EXECUCAO → EM_EXECUCAO → FINALIZADA → ENTREGUE
qualquer estado antes de FINALIZADA → CANCELADA (com compensação)
```

| Evento recebido | Estado | O orquestrador faz |
|---|---|---|
| (abertura via REST) | RECEBIDA | envia `GerarOrcamento` |
| `OrcamentoGerado` | AGUARDANDO_APROVACAO | notifica o cliente por e-mail com `linkAprovacao` |
| `OrcamentoAprovado` | — | reserva estoque; ok → `CobrarOrcamento`, AGUARDANDO_PAGAMENTO; falta peça → `CancelarOrcamento`, CANCELADA |
| `OrcamentoRecusado` | CANCELADA | — |
| `PagamentoAprovado` | AGUARDANDO_EXECUCAO | envia `AgendarExecucao` |
| `PagamentoRecusado` | CANCELADA | libera estoque |
| `ExecucaoAtualizada` (primeira) | EM_EXECUCAO | registra no histórico |
| `ExecucaoFinalizada` | FINALIZADA | — |
| `ExecucaoFalhou` | CANCELADA | libera estoque + `EstornarPagamento` |
| `PagamentoEstornado` | — | registra no histórico |

## Portas locais

| Serviço | HTTP | Banco |
|---|---|---|
| os-service | 3001 | Postgres `localhost:5433` (db `os`) |
| billing-service | 3002 | Postgres `localhost:5434` (db `billing`) |
| execution-service | 3003 | DynamoDB no Floci, tabela `oficina-execucoes` |
| Floci | 4566 | — |
| MailHog | 8025 (UI) / 1025 (SMTP) | — |

Todas as rotas HTTP com prefixo `/api`; Swagger em `/docs`; métricas Prometheus em `/api/metrics`; health em `/api/health`.

## Autenticação

JWT HS256 com segredo compartilhado `JWT_SECRET` (o mesmo da Lambda de auth da Fase 3). Rotas administrativas exigem `Authorization: Bearer`. Rotas públicas: link de aprovação do orçamento, pagamento pelo cliente e webhook do Mercado Pago (este valida a assinatura `x-signature`).
