import { handler } from "../lib/handlers/importProductsFile";
import {
  APIGatewayProxyEvent,
  Context,
  APIGatewayProxyResult,
} from "aws-lambda";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Mock the AWS SDK
jest.mock("@aws-sdk/client-s3");
jest.mock("@aws-sdk/s3-request-presigner");

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

describe("importProductsFile Lambda Handler", () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: "test-function",
    functionVersion: "1",
    invokedFunctionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:test-function",
    memoryLimitInMB: "128",
    awsRequestId: "test-request-id",
    logGroupName: "/aws/lambda/test-function",
    logStreamName: "2023/01/01/[$LATEST]test-stream",
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
  };

  const baseEvent: Partial<APIGatewayProxyEvent> = {
    httpMethod: "GET",
    path: "/import",
    headers: {},
    multiValueHeaders: {},
    requestContext: {
      requestId: "test-request-id",
      stage: "test",
      resourceId: "test-resource",
      httpMethod: "GET",
      resourcePath: "/import",
      path: "/test/import",
      accountId: "123456789012",
      apiId: "test-api-id",
      protocol: "HTTP/1.1",
      requestTime: "01/Jan/2023:00:00:00 +0000",
      requestTimeEpoch: 1672531200,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: "127.0.0.1",
        user: null,
        userAgent: "test-user-agent",
        userArn: null,
      },
      authorizer: null,
    },
    resource: "/import",
    pathParameters: null,
    stageVariables: null,
    body: null,
    isBase64Encoded: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.IMPORT_BUCKET_NAME = "test-import-bucket";
    process.env.AWS_REGION = "us-east-1";
  });

  afterEach(() => {
    delete process.env.IMPORT_BUCKET_NAME;
    delete process.env.AWS_REGION;
  });

  describe("Successful scenarios", () => {
    it("should generate signed URL successfully with valid fileName", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "test-products.csv" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      const mockSignedUrl =
        "https://test-bucket.s3.amazonaws.com/uploaded/test-products.csv?signed-url-params";
      mockGetSignedUrl.mockResolvedValue(mockSignedUrl);

      const result = (await handler(
        event,
        mockContext,
        jest.fn()
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(result.headers).toBeDefined();
      expect(result.headers!["Access-Control-Allow-Origin"]).toBe("*");

      const body = JSON.parse(result.body);
      expect(body.signedUrl).toBe(mockSignedUrl);
      expect(body.key).toBe("uploaded/test-products.csv");
      expect(body.bucketName).toBe("test-import-bucket");

      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object), // S3Client instance
        expect.any(PutObjectCommand),
        { expiresIn: 3600 }
      );
    });

    it("should handle fileName with special characters", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "test file with spaces & symbols.csv" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      const mockSignedUrl = "https://test-bucket.s3.amazonaws.com/signed-url";
      mockGetSignedUrl.mockResolvedValue(mockSignedUrl);

      const result = (await handler(
        event,
        mockContext,
        jest.fn()
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.key).toBe("uploaded/test file with spaces & symbols.csv");
    });
  });

  describe("CORS handling", () => {
    it("should handle OPTIONS request correctly", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        httpMethod: "OPTIONS",
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      const result = (await handler(
        event,
        mockContext,
        jest.fn()
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe("");
      expect(result.headers).toMatchObject({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers":
          "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      });

      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe("Error scenarios", () => {
    it("should return 400 when fileName parameter is missing", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      const result = (await handler(
        event,
        mockContext,
        jest.fn()
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      expect(result.headers!["Access-Control-Allow-Origin"]).toBe("*");

      const body = JSON.parse(result.body);
      expect(body.error).toBe("Missing required query parameter: name");

      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it("should return 400 when fileName parameter is empty", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      const result = (await handler(
        event,
        mockContext,
        jest.fn()
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Missing required query parameter: name");
    });

    it("should return 500 when IMPORT_BUCKET_NAME environment variable is not set", async () => {
      delete process.env.IMPORT_BUCKET_NAME;

      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "test.csv" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      const result = (await handler(
        event,
        mockContext,
        jest.fn()
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Server configuration error");

      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it("should return 500 when getSignedUrl throws an error", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "test.csv" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      const mockError = new Error("S3 service error");
      mockGetSignedUrl.mockRejectedValue(mockError);

      const result = (await handler(
        event,
        mockContext,
        jest.fn()
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Internal server error");
      expect(body.message).toBe("S3 service error");

      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    });

    it("should handle unknown error types", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "test.csv" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      mockGetSignedUrl.mockRejectedValue("String error");

      const result = (await handler(
        event,
        mockContext,
        jest.fn()
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Internal server error");
      expect(body.message).toBe("Unknown error");
    });
  });

  describe("PutObjectCommand configuration", () => {
    it("should create PutObjectCommand with correct parameters", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "products.csv" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      mockGetSignedUrl.mockResolvedValue("mock-signed-url");

      await handler(event, mockContext, jest.fn());

      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);

      const callArgs = mockGetSignedUrl.mock.calls[0];
      expect(callArgs[2]).toEqual({ expiresIn: 3600 });

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object), // S3Client instance
        expect.any(Object), // PutObjectCommand instance
        { expiresIn: 3600 }
      );
    });
  });

  describe("Logging", () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, "log").mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("should log incoming request details", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "test.csv" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      mockGetSignedUrl.mockResolvedValue("mock-signed-url");

      await handler(event, mockContext, jest.fn());

      expect(consoleSpy).toHaveBeenCalledWith(
        "GET /import - Incoming request:",
        expect.objectContaining({
          httpMethod: "GET",
          path: "/import",
          queryStringParameters: { name: "test.csv" },
          requestId: "test-request-id",
        })
      );
    });

    it("should log successful signed URL generation", async () => {
      const event: APIGatewayProxyEvent = {
        ...baseEvent,
        queryStringParameters: { name: "test.csv" },
        multiValueQueryStringParameters: null,
      } as APIGatewayProxyEvent;

      mockGetSignedUrl.mockResolvedValue("mock-signed-url");

      await handler(event, mockContext, jest.fn());

      expect(consoleSpy).toHaveBeenCalledWith(
        "Generating signed URL for key: uploaded/test.csv in bucket: test-import-bucket"
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Successfully generated signed URL"
      );
    });
  });
});
