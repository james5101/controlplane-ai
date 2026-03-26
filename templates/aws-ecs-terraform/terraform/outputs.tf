output "cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = module.ecs_service.cluster_arn
}
