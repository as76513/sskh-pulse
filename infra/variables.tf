variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Short name used to prefix resource names, tags, and DynamoDB table names (must match backend's DYNAMO_TABLE_PREFIX)."
  type        = string
  default     = "sskh-pulse"
}

variable "jwt_secret" {
  description = "Secret used to sign auth JWTs. Provide via terraform.tfvars (gitignored) or TF_VAR_jwt_secret — never commit it."
  type        = string
  sensitive   = true
}

variable "jwt_expires" {
  description = "JWT expiry, e.g. \"8h\"."
  type        = string
  default     = "8h"
}

variable "frontend_origin" {
  description = "Deployed frontend origin. Used for the API Gateway CORS policy and the S3 bucket CORS policy (direct browser upload/download)."
  type        = string
  default     = "http://localhost:5173"
}

variable "lambda_memory_size" {
  description = "Lambda memory in MB."
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds."
  type        = number
  default     = 10
}
