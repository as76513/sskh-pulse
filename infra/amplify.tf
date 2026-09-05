# Frontend hosting — AWS Amplify, manual deploys (no GitHub OAuth linkage; that
# requires a browser-based consent flow this can't drive). Build locally and
# push the built dist/ via infra/deploy_frontend.sh instead.

variable "frontend_root_domain" {
  description = "Root domain the frontend subdomain hangs off (GoDaddy-registered, not Route53)."
  type        = string
  default     = "shubhshreeknowledgehub.com"
}

variable "frontend_subdomain_prefix" {
  description = "Subdomain prefix for the frontend, e.g. \"sskh-pulse\" -> sskh-pulse.<frontend_root_domain>."
  type        = string
  default     = "sskh-pulse"
}

resource "aws_amplify_app" "frontend" {
  name = "${var.project_name}-frontend"

  # SPA client-side routing: unresolved paths fall back to index.html so
  # React Router handles them instead of Amplify 404ing.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }

  tags = local.tags
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = "main"

  tags = local.tags
}

resource "aws_amplify_domain_association" "frontend" {
  app_id                = aws_amplify_app.frontend.id
  domain_name           = var.frontend_root_domain
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = var.frontend_subdomain_prefix
  }
}
