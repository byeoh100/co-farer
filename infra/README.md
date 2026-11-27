# Co-farer infrastructure (Terraform)

docs/MIGRATION.md, Phase 3. One EC2 server in us-east-2 running Co-farer on
`workerd` behind Caddy (HTTPS), plus everything around it. Sign-in (Cognito)
was created in Phase 2b and is imported here.

| File | What |
| --- | --- |
| `ec2.tf` | The t4g.micro server (1 GB + 1 GB swap; change `instance_type` to grow) (Amazon Linux 2023 arm64), 20 GB encrypted gp3 disk, IMDSv2 only |
| `bootstrap.sh.tftpl` | First-boot setup: Caddy, workerd as a locked-down systemd service, DuckDNS, log shipping, nightly S3 backup, security updates, weekly reboot |
| `network.tf` | Security group (80 and 443 only, no SSH), Elastic IP |
| `iam.tf` | The server's least-privilege role; the snapshot service's role |
| `storage.tf` | Private S3 bucket: `releases/` (90 days) and `backups/` (14 days) |
| `monitoring.tf` | Log groups (30 days), health alarms, daily EBS snapshots (7 kept) |
| `cognito.tf` | User pool, domain, app client (imported; `prevent_destroy`) |
| `release.sh` | Build a release, upload it, and install it on the server |

## Use

```sh
export PATH="$HOME/.local/bin:$PATH"     # terraform and aws live here
cd infra
cp terraform.tfvars.example terraform.tfvars   # then fill in
terraform init
terraform plan
terraform apply
./release.sh --install                    # put the current code live
```

Open a shell on the server: `terraform output -raw shell` (needs the AWS
Session Manager plugin). There is no SSH.

## Things to know

- **State is in S3**: `s3://cofarer-tfstate-464079169769/cofarer/infra.tfstate` (versioned, private, encrypted, S3 locking; `backend.tf`). The bucket was made outside Terraform. To restore an older state, restore an older object version.
- **The server is never replaced by accident.** A new Amazon Linux image or a
  change to `bootstrap.sh.tftpl` is ignored for the running server. To apply
  one, back up first, then `terraform apply -replace=aws_instance.server`.
  The old disk is kept (`delete_on_termination = false`); restore the data
  from the latest S3 backup onto the new server.
- **Secrets never touch Terraform or the disk.** The server reads them from
  Parameter Store (`/cofarer/*`) at run time through its role.
- **Outside Terraform:** the Cognito Google provider (its secret would land in
  the state), Cognito's login branding, and the Parameter Store values.
