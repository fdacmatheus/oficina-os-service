terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Backend parcial: bucket/key/region chegam no `terraform init -backend-config=backend.hcl`.
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Projeto = "oficina"
      Servico = "os-service"
    }
  }
}

# ---------------------------------------------------------------------------
# Rede: VPC default do Learner Lab (sem NAT Gateway, que consumiria o crédito).
# O banco não tem IP público e só aceita conexões vindas da VPC.
# ---------------------------------------------------------------------------
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "os" {
  name       = "oficina-os-db"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "os_db" {
  name        = "oficina-os-db"
  description = "PostgreSQL do os-service, acessivel so de dentro da VPC"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "os_db_vpc" {
  security_group_id = aws_security_group.os_db.id
  cidr_ipv4         = data.aws_vpc.default.cidr_block
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "os_db_saida" {
  security_group_id = aws_security_group.os_db.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---------------------------------------------------------------------------
# Banco próprio do os-service. Nenhum outro serviço recebe essas credenciais.
# ---------------------------------------------------------------------------
resource "random_password" "os_db" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_instance" "os" {
  identifier     = "oficina-os-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.db_instance_class

  db_name  = "os"
  username = "os"
  password = random_password.os_db.result

  allocated_storage     = 20
  max_allocated_storage = 40
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.os.name
  vpc_security_group_ids = [aws_security_group.os_db.id]
  publicly_accessible    = false

  backup_retention_period = 1
  # Ambiente acadêmico com apply/destroy frequente; em produção, inverter os dois.
  skip_final_snapshot = true
  deletion_protection = false

  # O Learner Lab não permite criar a role do Enhanced Monitoring.
  performance_insights_enabled = false
  monitoring_interval          = 0
  apply_immediately            = true
}

resource "aws_secretsmanager_secret" "os_db" {
  name                    = "oficina/os/database"
  description             = "Credenciais do PostgreSQL do os-service"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "os_db" {
  secret_id = aws_secretsmanager_secret.os_db.id
  secret_string = jsonencode({
    DB_HOST     = aws_db_instance.os.address
    DB_PORT     = tostring(aws_db_instance.os.port)
    DB_NAME     = "os"
    DB_USER     = "os"
    DB_PASSWORD = random_password.os_db.result
  })
}

# ---------------------------------------------------------------------------
# Fila de entrada do os-service: eventos do billing e do execution.
# ---------------------------------------------------------------------------
resource "aws_sqs_queue" "eventos_dlq" {
  name                      = "os-eventos-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "eventos" {
  name                       = "os-eventos"
  visibility_timeout_seconds = 30
  receive_wait_time_seconds  = 20
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.eventos_dlq.arn
    maxReceiveCount     = 5
  })
}

# ---------------------------------------------------------------------------
# Acesso dos pods à fila. O Learner Lab não permite alterar a role dos nodes do
# EKS (LabEksNodeRole), então a permissão é dada do lado do recurso: só essa
# role, só as ações de mensageria. Todos os serviços rodam nos mesmos nodes, então
# os produtores (outros serviços) e o consumidor (este) usam a mesma role.
# ---------------------------------------------------------------------------
data "aws_iam_roles" "nodes_eks" {
  name_regex = ".*LabEksNodeRole.*"
}

resource "aws_sqs_queue_policy" "eventos" {
  queue_url = aws_sqs_queue.eventos.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PodsDoEks"
      Effect    = "Allow"
      Principal = { AWS = tolist(data.aws_iam_roles.nodes_eks.arns) }
      Action = [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility",
        "sqs:GetQueueAttributes",
      ]
      Resource = aws_sqs_queue.eventos.arn
    }]
  })
}

