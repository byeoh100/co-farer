data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

# ── The server's role ────────────────────────────────────────────────────
# Least privilege: exactly what the app and its scripts call. No iam:*,
# no PassRole, no wildcard resources beyond the Bedrock model's Regions.

resource "aws_iam_role" "server" {
  name = "cofarer-server"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Session Manager (no SSH) and SSM Run Command (Phase 4 deploys).
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

locals {
  account = data.aws_caller_identity.current.account_id
  # The US inference profile routes to these Regions' copies of the model.
  bedrock_model = replace(var.bedrock_model_id, "/^(us|global)\\./", "")
}

resource "aws_iam_role_policy" "server" {
  name = "cofarer-server"
  role = aws_iam_role.server.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockResearchModel"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:${data.aws_partition.current.partition}:bedrock:${var.region}:${local.account}:inference-profile/${var.bedrock_model_id}",
          "arn:${data.aws_partition.current.partition}:bedrock:*::foundation-model/${local.bedrock_model}",
        ]
      },
      {
        Sid      = "ReadAppParameters"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = "arn:${data.aws_partition.current.partition}:ssm:${var.region}:${local.account}:parameter/cofarer/*"
      },
      {
        Sid      = "DecryptSecureStrings"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = data.aws_kms_alias.ssm.target_key_arn
        Condition = {
          StringEquals = { "kms:ViaService" = "ssm.${var.region}.amazonaws.com" }
        }
      },
      {
        Sid      = "ReadReleases"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.main.arn}/releases/*"
      },
      {
        Sid      = "WriteBackups"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.main.arn}/backups/*"
      },
      {
        Sid      = "ShipLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
        Resource = [for g in aws_cloudwatch_log_group.app : "${g.arn}:*"]
      },
    ]
  })
}

resource "aws_iam_instance_profile" "server" {
  name = "cofarer-server"
  role = aws_iam_role.server.name
}

# ── Daily EBS snapshots (Data Lifecycle Manager) ─────────────────────────

resource "aws_iam_role" "dlm" {
  name = "cofarer-dlm"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "dlm.amazonaws.com" }
      Action    = "sts:AssumeRole"
      # Confused-deputy protection: only DLM acting for this account.
      Condition = { StringEquals = { "aws:SourceAccount" = local.account } }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}
