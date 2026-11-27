# Amazon Linux 2023, arm64: the newest image when the instance is created.
# Later image updates come through dnf-automatic, not by replacing the server.
data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

locals {
  caddy_version = "2.11.9"
  # sha512 from caddy_2.11.9_checksums.txt (GitHub release), checked on the server.
  caddy_sha512 = "9e5e76d7888542924de2c25353ae87c5f77e2a22c5b1198633cae13688922282e05383d142599205c88d8d80eee5e967d291214d7abce4835329a191b20dd6e0"
}

resource "aws_instance" "server" {
  ami                    = nonsensitive(data.aws_ssm_parameter.al2023_arm64.value)
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnet.server.id
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name
  monitoring             = false

  # Burstable credits: "standard" never bills for extra CPU.
  credit_specification {
    cpu_credits = "standard"
  }

  # IMDSv2 only, one hop (workerd runs on the host, not in a container).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
    # The app's data lives on this disk (/var/lib/cofarer/do), so it is
    # kept if the instance is ever terminated, and snapshotted daily.
    delete_on_termination = false
    tags = {
      Name   = "cofarer-root"
      Backup = "cofarer-daily"
    }
  }

  user_data = templatefile("${path.module}/bootstrap.sh.tftpl", {
    region            = var.region
    bucket            = aws_s3_bucket.main.id
    domain            = var.domain
    duckdns_subdomain = var.duckdns_subdomain
    public_ip         = aws_eip.server.public_ip
    owner_user_id     = var.owner_user_id
    cognito_domain    = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
    cognito_client_id = aws_cognito_user_pool_client.web.id
    cognito_pool_id   = aws_cognito_user_pool.main.id
    bedrock_model_id  = var.bedrock_model_id
    caddy_version     = local.caddy_version
    caddy_sha512      = local.caddy_sha512
  })

  tags = { Name = "cofarer" }

  lifecycle {
    # A new image or boot script must never replace the server (and its data)
    # behind your back. Change them deliberately: see infra/README.md.
    ignore_changes = [ami, user_data]
  }

  depends_on = [aws_cloudwatch_log_group.app]
}
