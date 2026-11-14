output "db_endpoint" {
  description = "Endereço do PostgreSQL do os-service."
  value       = aws_db_instance.os.address
}

output "db_secret_name" {
  description = "Secret com as credenciais do banco (lido pelo pipeline)."
  value       = aws_secretsmanager_secret.os_db.name
}

output "sqs_os_eventos_url" {
  description = "URL da fila de entrada do os-service."
  value       = aws_sqs_queue.eventos.url
}

output "sqs_os_eventos_dlq_url" {
  description = "URL da DLQ da fila de entrada."
  value       = aws_sqs_queue.eventos_dlq.url
}
