# Terraform state lives in a separate, versioned, private bucket (created
# outside Terraform on 2026-11-27, so the state never manages its own
# storage). S3-native locking: two runs can't change things at once.
terraform {
  backend "s3" {
    bucket       = "cofarer-tfstate-464079169769"
    key          = "cofarer/infra.tfstate"
    region       = "us-east-2"
    profile      = "cofarer"
    encrypt      = true
    use_lockfile = true
  }
}
