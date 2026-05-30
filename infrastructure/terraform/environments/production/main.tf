# =============================================================================
# Terraform — Production Environment
# =============================================================================
terraform {
  required_version = ">= 1.5"
  required_providers { aws = { source = "hashicorp/aws"; version = "~> 5.0" } }
  backend "s3" { bucket = "airos-terraform-state"; key = "production/terraform.tfstate"; region = "us-east-1" }
}

provider "aws" { region = "us-east-1" }

locals {
  project = "airos"
  env     = "production"
}

module "vpc" {
  source       = "../../modules/vpc"
  project_name = local.project
  environment  = local.env
}

module "eks" {
  source             = "../../modules/eks"
  project_name       = local.project
  environment        = local.env
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
}

module "rds" {
  source                     = "../../modules/rds"
  project_name               = local.project
  environment                = local.env
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  instance_class             = "db.r6i.xlarge"
  allocated_storage          = 200
  db_password                = var.db_password
}

module "redis" {
  source                     = "../../modules/redis"
  project_name               = local.project
  environment                = local.env
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  num_cache_clusters         = 3
}

module "s3" {
  source       = "../../modules/s3"
  project_name = local.project
  environment  = local.env
}

variable "db_password" {
  type      = string
  sensitive = true
}

output "vpc_id" { value = module.vpc.vpc_id }
output "eks_cluster" { value = module.eks.cluster_name }
output "rds_endpoint" { value = module.rds.cluster_endpoint }
output "redis_endpoint" { value = module.redis.primary_endpoint }
output "s3_bucket" { value = module.s3.bucket_name }
