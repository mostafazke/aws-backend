import {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEvent,
} from "aws-lambda";

export const handler = async (
  event: APIGatewayRequestAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  console.log("Authorizer event:", JSON.stringify(event, null, 2));

  try {
    const { methodArn } = event;
    const authorizationToken =
      event.headers?.Authorization || event.headers?.authorization;

    if (!authorizationToken) {
      console.log("No authorization token provided");
      throw new Error("Unauthorized");
    }

    if (!authorizationToken.startsWith("Basic ")) {
      console.log("Invalid authorization token format");
      throw new Error("Unauthorized");
    }

    const encodedCredentials = authorizationToken.substring(6);

    try {
      const decodedCredentials = Buffer.from(
        encodedCredentials,
        "base64"
      ).toString("utf-8");
      const [username, password] = decodedCredentials.split(":");

      if (!username || !password) {
        console.log("Invalid credentials format");
        throw new Error("Unauthorized");
      }

      const storedPassword = process.env[username];

      if (!storedPassword || storedPassword !== password) {
        console.log(`Invalid credentials for user: ${username}`);
        return generatePolicy("user", "Deny", methodArn);
      }

      console.log(`Valid credentials for user: ${username}`);

      return generatePolicy("user", "Allow", methodArn);
    } catch (decodeError) {
      console.log("Error decoding credentials:", decodeError);
      throw new Error("Unauthorized");
    }
  } catch (error) {
    console.log("Authorization error:", error);

    if (error instanceof Error && error.message === "Access Denied") {
      // Return 403 for invalid credentials
      throw new Error("Access Denied");
    }

    // Return 401 for missing/invalid authorization header
    throw new Error("Unauthorized");
  }
};

function generatePolicy(
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string
): APIGatewayAuthorizerResult {
  const authResponse: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  return authResponse;
}
