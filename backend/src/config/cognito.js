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
const EMAIL_DOMAIN = process.env.COGNITO_EMAIL_DOMAIN;

// The login screen collects a username like "john.doe", never an email —
// this pool's real identifier is "john.doe@<company domain>". Real company
// emails already follow exactly this convention, which is what lets anyone
// already in the shared pool log in with their existing password, with no
// setup on this app's side.
export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

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

// Never overwrites a password for a user that already exists in the shared
// pool — e.g. one of the real people the other app already provisioned.
// Returns whether it actually created a new user (vs. found an existing one).
export async function ensureCognitoUser(email, temporaryPassword) {
  try {
    await createCognitoUser(email, temporaryPassword);
    return true;
  } catch (e) {
    if (e.name === 'UsernameExistsException') return false;
    throw e;
  }
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
