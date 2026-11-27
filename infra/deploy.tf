# Push-to-deploy (docs/MIGRATION.md, Phase 4).
#
# GitHub Actions signs in to AWS with OpenID Connect (no stored AWS keys) as
# `cofarer-deploy`, which can only (1) upload to the releases/ prefix and
# (2) send the server ONE command: install a release by id. It cannot run
# arbitrary commands, read backups, or touch anything else.

resource "aws_ssm_document" "install_release" {
  name            = "cofarer-install-release"
  document_type   = "Command"
  document_format = "JSON"
  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Install a Co-farer release from S3; rolls back if /healthz doesn't answer within 60 s."
    parameters = {
      releaseId = {
        type           = "String"
        description    = "The release id (git sha, or sha-dirty-timestamp)."
        allowedPattern = "^[0-9a-zA-Z._-]{1,64}$"
      }
    }
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "install"
      inputs = {
        timeoutSeconds = "300"
        runCommand     = ["/opt/cofarer/bin/install-release '{{ releaseId }}'"]
      }
    }]
  })
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "deploy" {
  name                 = "cofarer-deploy"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          # Only pushes to the deploy branch(es) of this one repository.
          "token.actions.githubusercontent.com:sub" = [for b in var.deploy_branches : "repo:${var.github_repo}:ref:refs/heads/${b}"]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "cofarer-deploy"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "UploadReleases"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:PutObjectTagging"]
        Resource = "${aws_s3_bucket.main.arn}/releases/*"
      },
      {
        Sid      = "ReadLatestPointer"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.main.arn}/releases/latest.txt"
      },
      {
        Sid    = "InstallOnTheServer"
        Effect = "Allow"
        Action = ["ssm:SendCommand"]
        Resource = [
          aws_ssm_document.install_release.arn,
          aws_instance.server.arn,
        ]
      },
      {
        Sid      = "ReadCommandResults"
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
        Resource = "*" # these SSM actions don't support resource-level permissions
      },
    ]
  })
}
