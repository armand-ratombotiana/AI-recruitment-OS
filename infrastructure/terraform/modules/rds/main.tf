# =============================================================================
# Terraform — RDS PostgreSQL Module
# =============================================================================
variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" { type = list(string) }
variable "instance_class" { type = string; default = "db.r6i.xlarge" }
variable "allocated_storage" { type = number; default = 100 }
variable "engine_version" { type = string; default = "16.4" }

resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-${var.environment}-rds-"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }
  egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
  tags = { Name = "${var.project_name}-rds-sg" }
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}"
  subnet_ids = var.subnet_ids
  tags = { Name = "${var.project_name}-${var.environment}-db-subnet" }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "${var.project_name}-${var.environment}"
  engine                 = "aurora-postgresql"
  engine_version         = var.engine_version
  database_name          = "airos"
  master_username        = "airos"
  master_password        = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  storage_encrypted      = true
  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"
  skip_final_snapshot    = var.environment != "production"
  tags = { Environment = var.environment }
}

resource "aws_rds_cluster_instance" "main" {
  count              = var.environment == "production" ? 2 : 1
  identifier         = "${var.project_name}-${var.environment}-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = var.instance_class
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
  publicly_accessible = false
  tags = { Environment = var.environment }
}

variable "db_password" { type = string, sensitive = true }

output "cluster_endpoint" { value = aws_rds_cluster.main.endpoint }
output "cluster_reader_endpoint" { value = aws_rds_cluster.main.reader_endpoint }
output "database_name" { value = aws_rds_cluster.main.database_name }
output "security_group_id" { value = aws_security_group.rds.id }
