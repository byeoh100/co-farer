variable "region" {
  description = "The project's one AWS Region."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "Local AWS CLI profile Terraform signs with."
  type        = string
  default     = "cofarer"
}

variable "domain" {
  description = "The app's public address (DuckDNS)."
  type        = string
  default     = "co-farer.duckdns.org"
}

variable "duckdns_subdomain" {
  description = "The DuckDNS name (without .duckdns.org). Its token is SecureString /cofarer/duckdns-token."
  type        = string
  default     = "co-farer"
}

variable "instance_type" {
  description = "EC2 size. t4g.micro: 2 Arm vCPUs, 1 GB (plus 1 GB swap). Grow to t4g.small by changing this and applying: a few minutes' stop/start, same disk and address."
  type        = string
  default     = "t4g.micro"
}

variable "owner_user_id" {
  description = "The app owner's user ID (their Cognito sub): the cron tasks run as this identity and it gets the admin role."
  type        = string
}

variable "alarm_email" {
  description = "Where instance health alarms are emailed. Empty = no email subscription."
  type        = string
  default     = ""
}

variable "bedrock_model_id" {
  description = "Bedrock inference profile for research (docs/MIGRATION.md 2a)."
  type        = string
  default     = "us.anthropic.claude-haiku-5-5"
}

variable "github_repo" {
  description = "GitHub repository allowed to deploy (owner/name)."
  type        = string
  default     = "byeoh100/co-farer"
}

variable "deploy_branches" {
  description = "Branches whose pushes may deploy. self-host until Phase 5 switches the live app over; then main."
  type        = list(string)
  default     = ["self-host"]
}
