import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyHandler } from "aws-lambda";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log("GET /import - Incoming request:", {
    httpMethod: event.httpMethod,
    path: event.path,
    queryStringParameters: event.queryStringParameters,
    headers: event.headers,
    requestId: event.requestContext?.requestId,
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  try {
    const fileName = event.queryStringParameters?.name;

    if (!fileName) {
      console.log("Missing fileName parameter");
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "Missing required query parameter: name",
        }),
      };
    }

    const bucketName = process.env.IMPORT_BUCKET_NAME;
    if (!bucketName) {
      console.error("IMPORT_BUCKET_NAME environment variable not set");
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "Server configuration error",
        }),
      };
    }

    const key = `uploaded/${fileName}`;
    console.log(
      `Generating signed URL for key: ${key} in bucket: ${bucketName}`
    );

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: "text/csv",
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    console.log("Successfully generated signed URL");

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        signedUrl,
        key,
        bucketName,
      }),
    };
  } catch (error) {
    console.error("Error generating signed URL:", error);

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
