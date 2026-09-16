import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import dotenv from 'dotenv';
dotenv.config();

// No local emulator for Cognito — this always talks to the real (shared)
// user pool, both in local dev (via AWS_PROFILE) and in Lambda (via its
// execution role). Same pattern as utils/s3.js.
const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

// Resolves once a request has already looked up the employee's real email —
// the screen only ever collects a username, never the email itself.
export async function verifyCognitoPassword(email, password) {
  await client.send(
    new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    })
  );
}

export async function createCognitoUser(email, temporaryPassword) {
  await client.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    })
  );
  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: temporaryPassword,
      Permanent: true,
    })
  );
}

export async function setCognitoPassword(email, newPassword) {
  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: newPassword,
      Permanent: true,
    })
  );
}
