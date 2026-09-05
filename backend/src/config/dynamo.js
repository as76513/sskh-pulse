import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
dotenv.config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  // Point at DynamoDB Local for development (docker-compose up in infra/).
  ...(process.env.DYNAMO_ENDPOINT ? { endpoint: process.env.DYNAMO_ENDPOINT } : {}),
});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const PREFIX = process.env.DYNAMO_TABLE_PREFIX || 'sskh-pulse';

export const Tables = {
  employees: `${PREFIX}-employees`,
  offices: `${PREFIX}-offices`,
  attendance: `${PREFIX}-attendance`,
  leaves: `${PREFIX}-leaves`,
  documents: `${PREFIX}-documents`,
  payslips: `${PREFIX}-payslips`,
  resignations: `${PREFIX}-resignations`,
};

export {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
};
