resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "files" {
  bucket = "${var.project_name}-files-${random_id.bucket_suffix.hex}"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket = aws_s3_bucket.files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Documents/payslips are uploaded and downloaded directly from the browser
# via presigned URLs (see backend/src/utils/s3.js) — the frontend origin
# needs PUT/GET CORS access.
resource "aws_s3_bucket_cors_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = [var.frontend_origin]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
  }
}
