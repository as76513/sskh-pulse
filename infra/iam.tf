data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${var.project_name}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

locals {
  dynamodb_table_arns = [
    aws_dynamodb_table.employees.arn,
    aws_dynamodb_table.offices.arn,
    aws_dynamodb_table.attendance.arn,
    aws_dynamodb_table.leaves.arn,
    aws_dynamodb_table.documents.arn,
    aws_dynamodb_table.payslips.arn,
    aws_dynamodb_table.resignations.arn,
  ]
  dynamodb_index_arns = [for arn in local.dynamodb_table_arns : "${arn}/index/*"]
}

data "aws_iam_policy_document" "lambda_app" {
  statement {
    sid = "DynamoDbAccess"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
    ]
    resources = concat(local.dynamodb_table_arns, local.dynamodb_index_arns)
  }

  statement {
    sid       = "S3DocumentAccess"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.files.arn}/*"]
  }

  # Scoped to exactly the one (shared, externally-owned) user pool — never
  # broadened to cognito-idp:* or to other pools in the account.
  statement {
    sid = "CognitoAuth"
    actions = [
      "cognito-idp:AdminInitiateAuth",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
    ]
    resources = ["arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/${var.cognito_user_pool_id}"]
  }
}

data "aws_caller_identity" "current" {}

resource "aws_iam_role_policy" "lambda_app" {
  name   = "${var.project_name}-lambda-app"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_app.json
}
