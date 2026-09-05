# On-demand billing — request volume for an internal attendance app is tiny,
# so this stays effectively pennies/month without having to size provisioned
# capacity across 7 tables + GSIs.

resource "aws_dynamodb_table" "employees" {
  name         = "${var.project_name}-employees"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "emp_code"

  attribute {
    name = "emp_code"
    type = "S"
  }
  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "offices" {
  name         = "${var.project_name}-offices"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "attendance" {
  name         = "${var.project_name}-attendance"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "emp_code"
  range_key    = "work_date"

  attribute {
    name = "emp_code"
    type = "S"
  }
  attribute {
    name = "work_date"
    type = "S"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "leaves" {
  name         = "${var.project_name}-leaves"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "emp_code"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "applied_at"
    type = "S"
  }

  global_secondary_index {
    name            = "emp_code-index"
    hash_key        = "emp_code"
    range_key       = "applied_at"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    range_key       = "applied_at"
    projection_type = "ALL"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "documents" {
  name         = "${var.project_name}-documents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "emp_code"
    type = "S"
  }
  attribute {
    name = "uploaded_at"
    type = "S"
  }

  global_secondary_index {
    name            = "emp_code-index"
    hash_key        = "emp_code"
    range_key       = "uploaded_at"
    projection_type = "ALL"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "payslips" {
  name         = "${var.project_name}-payslips"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "emp_code"
  range_key    = "pay_month"

  attribute {
    name = "emp_code"
    type = "S"
  }
  attribute {
    name = "pay_month"
    type = "S"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "resignations" {
  name         = "${var.project_name}-resignations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "emp_code"
  range_key    = "submitted_at"

  attribute {
    name = "emp_code"
    type = "S"
  }
  attribute {
    name = "submitted_at"
    type = "S"
  }

  tags = local.tags
}
