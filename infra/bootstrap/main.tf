# One-time, run-once-per-environment bootstrap: creates the S3 bucket that
# ../  (the real infra config) stores its remote state in. This can't live in
# ../ itself — that config's backend can't be the bucket it's still creating.
#
# This directory's own state stays local (see README.md at the repo's infra/
# level) — it's the one exception, since there's nothing left to bootstrap it
# with. Back up bootstrap/terraform.tfstate after applying.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "project_name" {
  type    = string
  default = "sskh-pulse"
}

resource "random_id" "state_bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "tf_state" {
  bucket = "${var.project_name}-tf-state-${random_id.state_bucket_suffix.hex}"

  # Guard against `terraform destroy` here accidentally deleting the bucket
  # that ../ 's state lives in.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "state_bucket_name" {
  value = aws_s3_bucket.tf_state.bucket
}
