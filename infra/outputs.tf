output "url" {
  value = "https://${var.domain}"
}

output "public_ip" {
  value = aws_eip.server.public_ip
}

output "instance_id" {
  value = aws_instance.server.id
}

output "bucket" {
  value = aws_s3_bucket.main.id
}

output "shell" {
  description = "Open a shell on the server (no SSH): needs the Session Manager plugin."
  value       = "aws ssm start-session --profile ${var.aws_profile} --region ${var.region} --target ${aws_instance.server.id}"
}

output "deploy_role_arn" {
  description = "For .github/workflows/deploy.yml (not a secret)."
  value       = aws_iam_role.deploy.arn
}
