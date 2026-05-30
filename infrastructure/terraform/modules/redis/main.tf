# =============================================================================
# Terraform — ElastiCache Redis Module
# =============================================================================
variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" { type = list(string) }
variable "node_type" { type = string; default = "cache.r6g.large" }
variable "num_cache_clusters" { type = number; default = 2 }

resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-${var.environment}-redis-"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }
  egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
  tags = { Name = "${var.project_name}-redis-sg" }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.project_name}-${var.environment}"
  description                = "AI-ROS Redis cluster"
  node_type                  = var.node_type
  num_cache_clusters         = var.num_cache_clusters
  port                       = 6379
  automatic_failover_enabled = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  snapshot_retention_limit   = var.environment == "production" ? 7 : 1
  tags = { Environment = var.environment }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}"
  subnet_ids = var.subnet_ids
}

output "primary_endpoint" { value = aws_elasticache_replication_group.main.primary_endpoint_address }
output "reader_endpoint" { value = aws_elasticache_replication_group.main.reader_endpoint_address }
output "security_group_id" { value = aws_security_group.redis.id }
