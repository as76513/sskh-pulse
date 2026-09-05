output "api_base_url" {
  description = "Base invoke URL. Set the frontend's VITE_API_URL to this + \"api\" (e.g. https://xxxx.execute-api.ap-south-1.amazonaws.com/api)."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "s3_bucket_name" {
  value = aws_s3_bucket.files.bucket
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "dynamodb_table_names" {
  value = [for arn in local.dynamodb_table_arns : split("/", arn)[1]]
}

# --- Custom domain (GoDaddy DNS) — see infra/README.md for the two-phase apply ---

output "api_cert_validation_record" {
  description = "Add this as a CNAME in GoDaddy first — proves domain ownership to ACM. Only available after `terraform apply -target=aws_acm_certificate.api`."
  value = {
    name  = tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_name
    type  = tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_type
    value = tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_value
  }
}

output "api_gateway_target_domain" {
  description = "Add this as a second CNAME in GoDaddy — api_domain_name (sskh-api.shubhshreeknowledgehub.com) points here. Only available after the cert is validated and the full apply completes."
  value       = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
}

# --- Frontend (Amplify Hosting) ---

output "amplify_app_id" {
  description = "Used by deploy_frontend.sh to push builds."
  value       = aws_amplify_app.frontend.id
}

output "amplify_default_url" {
  description = "The branch's default amplifyapp.com URL — test here before the custom domain is wired up."
  value       = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.frontend.default_domain}"
}

output "amplify_domain_verification_record" {
  description = "Add this CNAME in GoDaddy to prove ownership of frontend_root_domain to Amplify."
  value       = aws_amplify_domain_association.frontend.certificate_verification_dns_record
}

output "amplify_subdomain_dns_record" {
  description = "Add this CNAME in GoDaddy for the sskh-pulse subdomain itself. May be empty right after apply — Amplify provisions it asynchronously; re-run `terraform refresh` / check `aws amplify get-domain-association` if blank."
  value       = try([for s in aws_amplify_domain_association.frontend.sub_domain : s.dns_record][0], null)
}
