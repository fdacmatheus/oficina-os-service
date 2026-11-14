variable "region" {
  description = "Região AWS. O AWS Academy Learner Lab só libera us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "db_instance_class" {
  description = "Classe da instância RDS."
  type        = string
  default     = "db.t3.micro"
}

variable "engine_version" {
  description = "Versão do PostgreSQL."
  type        = string
  default     = "16.15"
}
