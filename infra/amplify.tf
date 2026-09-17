# Frontend hosting — AWS Amplify, GitHub-connected. Pushes to main trigger a
# build. The first attach needs var.github_access_token (repo + admin:repo_hook);
# later applies ignore it so the token is not required again.

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

variable "github_repository" {
  description = "HTTPS URL of the GitHub repo Amplify builds from."
  type        = string
  default     = "https://github.com/as76513/sskh-pulse"
}

variable "github_access_token" {
  description = "GitHub PAT with repo + admin:repo_hook. Needed only when first attaching the repo (or changing it). Set TF_VAR_github_access_token — never commit it."
  type        = string
  sensitive   = true
  default     = null
}

resource "aws_amplify_app" "frontend" {
  name         = "${var.project_name}-frontend"
  repository   = var.github_repository
  access_token = var.github_access_token

  # Same spec as the repo-root amplify.yml — used if the file is missing on a branch.
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - nvm use 20 || nvm use 18
            - npm ci --prefix frontend
        build:
          commands:
            - npm run build --prefix frontend
      artifacts:
        baseDirectory: frontend/dist
        files:
          - '**/*'
      cache:
        paths:
          - frontend/node_modules/**/*
  EOT

  # SPA client-side routing: unresolved paths fall back to index.html so
  # React Router handles them instead of Amplify 404ing.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }

  tags = local.tags

  lifecycle {
    ignore_changes = [access_token]
  }
}

resource "aws_amplify_branch" "main" {
  app_id            = aws_amplify_app.frontend.id
  branch_name       = "main"
  enable_auto_build = true
  stage             = "PRODUCTION"

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
