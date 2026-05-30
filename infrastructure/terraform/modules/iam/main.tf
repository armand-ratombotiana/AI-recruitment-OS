# =============================================================================
# Terraform — IAM Module (EKS + Service Roles)
# =============================================================================
variable "project_name" { type = string }
variable "environment" { type = string }
variable "s3_bucket_arn" { type = string }

# EKS Cluster Role
resource "aws_iam_role" "cluster" {
  name = "${var.project_name}-${var.environment}-cluster"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "eks.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster_EKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

# EKS Node Role
resource "aws_iam_role" "node" {
  name = "${var.project_name}-${var.environment}-node"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "node_EKSWorkerNodePolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_EKS_CNI_Policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_ECRReadOnly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node.name
}

# Application S3 Access Policy
resource "aws_iam_policy" "app_s3" {
  name        = "${var.project_name}-${var.environment}-s3"
  description = "S3 access for AI-ROS application"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${var.s3_bucket_arn}/*" },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = var.s3_bucket_arn },
    ]
  })
}

# Application Secrets Policy
resource "aws_iam_policy" "app_secrets" {
  name        = "${var.project_name}-${var.environment}-secrets"
  description = "Secrets Manager access for AI-ROS"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"], Resource = "arn:aws:secretsmanager:*:*:secret:${var.project_name}/*" },
    ]
  })
}

# Application Service Account Role (for IRSA)
resource "aws_iam_role" "app_service" {
  name = "${var.project_name}-${var.environment}-app-service"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Condition = { StringEquals = { "${var.oidc_provider}:sub" = "system:serviceaccount:airos:airos-app" } }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "app_s3" {
  policy_arn = aws_iam_policy.app_s3.arn
  role       = aws_iam_role.app_service.name
}

resource "aws_iam_role_policy_attachment" "app_secrets" {
  policy_arn = aws_iam_policy.app_secrets.arn
  role       = aws_iam_role.app_service.name
}

variable "oidc_provider_arn" { type = string }
variable "oidc_provider" { type = string }

output "cluster_role_arn" { value = aws_iam_role.cluster.arn }
output "node_role_arn" { value = aws_iam_role.node.arn }
output "app_service_role_arn" { value = aws_iam_role.app_service.arn }
