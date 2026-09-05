# Requires infra/build/lambda.zip to already exist — run ./build_lambda.sh
# before the first `terraform apply` and again after any backend code change.

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-api"
  filename         = "${path.module}/build/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/build/lambda.zip")

  handler = "src/lambda.handler"
  runtime = "nodejs20.x"
  role    = aws_iam_role.lambda_exec.arn

  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  environment {
    variables = {
      JWT_SECRET          = var.jwt_secret
      JWT_EXPIRES         = var.jwt_expires
      DYNAMO_TABLE_PREFIX = var.project_name
      S3_BUCKET           = aws_s3_bucket.files.bucket
      CLIENT_ORIGIN       = var.frontend_origin
      # AWS_REGION is provided automatically by the Lambda runtime — do not set it here,
      # Lambda rejects it as a reserved environment variable name.
      #
      # Deliberately no AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_PROFILE here.
      # The SDK picks up aws_iam_role.lambda_exec's temporary credentials from the
      # Lambda execution environment automatically — production always authenticates
      # via that role, never static keys. Local dev uses AWS_PROFILE (see backend/.env.example).
    }
  }

  tags = local.tags
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 14
  tags              = local.tags
}
