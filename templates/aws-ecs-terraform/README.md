# {{ repo_name }}

Scaffolded by [ControlPlane AI](https://controlplane.ai).

## Infrastructure

- **Cloud:** AWS
- **Service type:** ECS
- **Environments:** dev, prod
- **IaC:** Terraform
- **CI/CD:** GitHub Actions (OIDC auth)

## Getting started

1. Configure AWS OIDC role and add `AWS_ROLE_ARN` to GitHub secrets
2. Create S3 backend bucket and update `terraform/main.tf` backend config
3. Review and merge the scaffold PR

## Environments

| Environment | Branch | Auto-deploy |
|---|---|---|
| dev | any PR | plan only |
| prod | main | apply on merge |
