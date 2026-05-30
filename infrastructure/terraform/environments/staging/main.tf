# =============================================================================
# Terraform — Staging Environment
# =============================================================================
terraform {
  required_version = ">= 1.5"
  required_providers { aws = { source = "hashicorp/aws"; version = "~> 5.0" } }
  backend "s3" { bucket = "airos-terraform-state"; key = "staging/terraform.tfstate"; region = "us-east-1" }
}

provider "aws" { region = "us-east-1" }

module "vpc" {
  source        = "../../modules/vpc"
  project_name  = "airos"
  environment   = "staging"
}

module "eks" {
  source              = "../../modules/eks"
  project_name        = "airos"
  environment         = "staging"
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
}

output "vpc_id" { value = module.vpc.vpc_id }
output "eks_cluster" { value = module.eks.cluster_name }
