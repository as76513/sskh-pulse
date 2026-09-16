# Auth is delegated to an existing, shared Cognito User Pool (not created or
# fully managed here — it belongs to another app and already has real users).
# We only ever create a new, dedicated app client inside it — purely additive,
# never touches the pool's existing client/schema/settings.

variable "cognito_user_pool_id" {
  description = "Existing, shared Cognito User Pool ID that SSKH Pulse authenticates against. Owned by another app — this project never modifies the pool itself, only adds its own app client."
  type        = string
  default     = "ap-south-1_Gj6XcAi9D"
}

variable "cognito_email_domain" {
  description = "Real company email domain — the login screen's username (e.g. \"john.doe\") becomes \"<username>@<this domain>\", the actual identifier Cognito authenticates against. See usernameToEmail in backend/src/config/cognito.js."
  type        = string
  default     = "shubhshreeknowledgehub.com"
}

resource "aws_cognito_user_pool_client" "sskh_pulse" {
  name         = "${var.project_name}-client"
  user_pool_id = var.cognito_user_pool_id

  generate_secret = false

  # Server-side (Lambda calls AdminInitiateAuth with the user's email +
  # password) — no browser-side SRP/OAuth flow, so nothing else is needed here.
  explicit_auth_flows = ["ALLOW_ADMIN_USER_PASSWORD_AUTH"]

  prevent_user_existence_errors = "ENABLED"
}
