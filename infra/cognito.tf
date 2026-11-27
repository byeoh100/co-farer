# Sign-in (docs/MIGRATION.md 2b). These were created with the CLI on
# 2026-11-25 and imported (cognito_import.tf). prevent_destroy: replacing the
# pool would delete every account, so Terraform refuses any plan that would.
#
# Managed outside Terraform on purpose:
#  - the Google identity provider: its config holds the Google client secret,
#    which would otherwise be stored in plain text in the Terraform state;
#  - the managed login branding (Cognito's default look).
# Both are recorded in docs/SELF-HOST.md.

resource "aws_cognito_user_pool" "main" {
  name                     = "cofarer"
  user_pool_tier           = "ESSENTIALS"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = "INACTIVE"

  sign_in_policy {
    allowed_first_auth_factors = ["EMAIL_OTP", "PASSWORD"]
  }

  username_configuration {
    case_sensitive = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  password_policy {
    minimum_length                   = 12
    password_history_size            = 0
    require_lowercase                = false
    require_numbers                  = false
    require_symbols                  = false
    require_uppercase                = false
    temporary_password_validity_days = 7
  }

  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "email"
    required                 = true
    string_attribute_constraints {
      max_length = "2048"
      min_length = "0"
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain                = "co-farer"
  user_pool_id          = aws_cognito_user_pool.main.id
  managed_login_version = 2

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "cofarer-web"
  user_pool_id = aws_cognito_user_pool.main.id

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = ["http://localhost:8080/auth/callback", "https://${var.domain}/auth/callback"]
  logout_urls                          = ["http://localhost:8080/", "https://${var.domain}/"]
  supported_identity_providers         = ["COGNITO", "Google"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_AUTH"]

  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
  auth_session_validity                         = 3
  enable_token_revocation                       = true
  enable_propagate_additional_user_context_data = false
  prevent_user_existence_errors                 = "ENABLED"
  read_attributes                               = ["email", "email_verified", "name"]
  write_attributes                              = ["email", "name"]

  lifecycle {
    prevent_destroy = true
  }
}
