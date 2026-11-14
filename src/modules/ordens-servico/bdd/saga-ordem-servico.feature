# language: pt
Funcionalidade: Saga da ordem de serviço
  Como oficina
  Quero que a OS passe por orçamento, pagamento e execução em serviços diferentes
  Para que uma falha em qualquer etapa desfaça o que já foi feito, sem deixar estoque preso nem cobrança indevida

  Contexto:
    Dado que o estoque tem 10 unidades da peça "peca-oleo"
    E uma OS aberta com 4 unidades da peça "peca-oleo"

  Cenário: Caminho feliz da abertura à finalização
    Então o billing recebe o comando "GerarOrcamento"
    Quando o billing publica "OrcamentoGerado"
    Então a OS fica em "AGUARDANDO_APROVACAO"
    E o cliente recebe por e-mail o link de aprovação
    Quando o billing publica "OrcamentoAprovado"
    Então a OS fica em "AGUARDANDO_PAGAMENTO"
    E o estoque da peça "peca-oleo" fica com 6 unidades
    E o billing recebe o comando "CobrarOrcamento"
    Quando o billing publica "PagamentoAprovado"
    Então a OS fica em "AGUARDANDO_EXECUCAO"
    E o execution recebe o comando "AgendarExecucao"
    Quando o execution publica "ExecucaoAtualizada"
    Então a OS fica em "EM_EXECUCAO"
    Quando o execution publica "ExecucaoFinalizada"
    Então a OS fica em "FINALIZADA"
    E o histórico da OS tem 6 eventos

  Cenário: Cliente recusa o orçamento
    Dado que a OS está em "AGUARDANDO_APROVACAO"
    Quando o billing publica "OrcamentoRecusado"
    Então a OS fica em "CANCELADA" com motivo "ORCAMENTO_RECUSADO"
    E o estoque da peça "peca-oleo" fica com 10 unidades
    E nenhum comando de compensação é enviado

  Cenário: Falta peça no estoque quando o orçamento é aprovado
    Dado que o estoque da peça "peca-oleo" caiu para 2 unidades
    E que a OS está em "AGUARDANDO_APROVACAO"
    Quando o billing publica "OrcamentoAprovado"
    Então a OS fica em "CANCELADA" com motivo "ESTOQUE_INSUFICIENTE"
    E o estoque da peça "peca-oleo" fica com 2 unidades
    E o billing recebe o comando "CancelarOrcamento"

  Cenário: Pagamento recusado devolve as peças ao estoque
    Dado que a OS está em "AGUARDANDO_PAGAMENTO"
    Quando o billing publica "PagamentoRecusado"
    Então a OS fica em "CANCELADA" com motivo "PAGAMENTO_RECUSADO"
    E o estoque da peça "peca-oleo" fica com 10 unidades
    E nenhum comando de compensação é enviado

  Cenário: Falha na execução estorna o pagamento e devolve as peças
    Dado que a OS está em "EM_EXECUCAO"
    Quando o execution publica "ExecucaoFalhou"
    Então a OS fica em "CANCELADA" com motivo "EXECUCAO_FALHOU"
    E o estoque da peça "peca-oleo" fica com 10 unidades
    E o billing recebe o comando "EstornarPagamento"

  Cenário: Oficina cancela uma OS já paga
    Dado que a OS está em "AGUARDANDO_EXECUCAO"
    Quando a oficina cancela a OS
    Então a OS fica em "CANCELADA" com motivo "CANCELADA_PELA_OFICINA"
    E o estoque da peça "peca-oleo" fica com 10 unidades
    E o billing recebe o comando "EstornarPagamento"
    E o execution recebe o comando "CancelarExecucao"

  Cenário: Pagamento confirmado depois do cancelamento é estornado
    Dado que a OS está em "AGUARDANDO_PAGAMENTO"
    E a oficina cancela a OS
    Quando o billing publica "PagamentoAprovado"
    Então a OS fica em "CANCELADA" com motivo "CANCELADA_PELA_OFICINA"
    E o billing recebe o comando "EstornarPagamento"

  Cenário: Mensagem entregue duas vezes pelo SQS é aplicada uma vez só
    Dado que a OS está em "AGUARDANDO_APROVACAO"
    Quando o billing publica "OrcamentoAprovado" duas vezes com o mesmo id
    Então o estoque da peça "peca-oleo" fica com 6 unidades
    E o billing recebe o comando "CobrarOrcamento" uma única vez
