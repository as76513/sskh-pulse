# Maps var.api_domain_name (a GoDaddy-registered subdomain, DNS not managed by
# Terraform) onto the HTTP API. This is a two-phase apply because ACM's DNS
# validation record has to be added in GoDaddy by hand — see infra/README.md.

variable "api_domain_name" {
  description = "Custom domain for the API Gateway HTTP API. DNS lives in GoDaddy, not Route53 — see README for the manual CNAME steps."
  type        = string
  default     = "sskh-api.shubhshreeknowledgehub.com"
}

resource "aws_acm_certificate" "api" {
  domain_name       = var.api_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

# Blocks until ACM sees the validation CNAME (added manually in GoDaddy) and
# marks the certificate ISSUED. Apply aws_acm_certificate.api on its own first
# (see README) so you have the validation record to add before this runs.
resource "aws_acm_certificate_validation" "api" {
  certificate_arn = aws_acm_certificate.api.arn
}

resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = var.api_domain_name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = local.tags
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.http_api.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}
