# =============================================================================
# Terraform — S3 Storage Module
# =============================================================================
variable "project_name" { type = string }
variable "environment" { type = string }
variable "enable_versioning" { type = bool; default = true }

resource "aws_s3_bucket" "main" {
  bucket = "${var.project_name}-${var.environment}-storage"
  tags = { Environment = var.environment }
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  versioning_configuration { status = var.enable_versioning ? "Enabled" : "Suspended" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" } }
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket                  = aws_s3_bucket.main.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  rule {
    id     = "archive"
    status = "Enabled"
    transition { days = 90; storage_class = "GLACIER" }
    expiration { days = 365 }
  }
}

output "bucket_name" { value = aws_s3_bucket.main.id }
output "bucket_arn" { value = aws_s3_bucket.main.arn }
