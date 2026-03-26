terraform {
  required_version = ">= {{ tf_version }}"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    # Populated per environment via -backend-config
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy   = "controlplane-ai"
      Environment = var.environment
      Service     = var.service_name
    }
  }
}

module "ecs_service" {
  source = "terraform-aws-modules/ecs/aws"

  cluster_name = "${var.service_name}-${var.environment}"
  # Additional configuration via variables
}
