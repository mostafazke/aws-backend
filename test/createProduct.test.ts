// Mock AWS SDK - declare mock function first to avoid hoisting issues
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => ({
    send: mockSend
  })),
  TransactWriteItemsCommand: jest.fn()
}));

import { handler as createProduct } from "../lib/handlers/createProduct";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

// Mock UUID
jest.mock("uuid", () => ({
  v4: jest.fn(() => "mocked-uuid-123")
}));

const createMockEvent = (body: any): APIGatewayProxyEvent => ({
  httpMethod: "POST",
  path: "/products",
  headers: {},
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  body: JSON.stringify(body),
  isBase64Encoded: false,
  pathParameters: null,
  stageVariables: null,
  resource: "",
  requestContext: {
    requestId: "test-request-id",
    stage: "test",
    resourceId: "",
    httpMethod: "POST",
    path: "/products",
    accountId: "",
    resourcePath: "",
    apiId: "",
    protocol: "",
    requestTime: "",
    requestTimeEpoch: 0,
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
      sourceIp: "",
      user: null,
      userAgent: null,
      userArn: null,
    },
    authorizer: {}
  }
});

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: "",
  functionVersion: "",
  invokedFunctionArn: "",
  memoryLimitInMB: "",
  awsRequestId: "",
  logGroupName: "",
  logStreamName: "",
  getRemainingTimeInMillis: () => 0,
  done: () => {},
  fail: () => {},
  succeed: () => {}
};

describe("createProduct handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful response
    mockSend.mockResolvedValue({});

    // Set environment variables
    process.env.PRODUCTS_TABLE = "products";
    process.env.STOCK_TABLE = "stock";
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates product successfully with valid data", async () => {
    const productData = {
      title: "Test Product",
      description: "Test Description",
      price: 29.99,
      count: 10
    };

    const event = createMockEvent(productData);
    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.id).toBe("mocked-uuid-123");
    expect(body.title).toBe(productData.title);
    expect(body.price).toBe(productData.price);
    expect(body.count).toBe(productData.count);
  });

  it("returns 400 for invalid product data - missing title", async () => {
    const productData = {
      description: "Test Description",
      price: 29.99,
      count: 10
    };

    const event = createMockEvent(productData);
    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Invalid product data");
    expect(body.errors).toContain("Title is required and must be a non-empty string");
  });

  it("returns 400 for invalid product data - negative price", async () => {
    const productData = {
      title: "Test Product",
      description: "Test Description",
      price: -10,
      count: 10
    };

    const event = createMockEvent(productData);
    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Invalid product data");
    expect(body.errors).toContain("Price is required and must be a positive number");
  });

  it("returns 400 for invalid product data - negative count", async () => {
    const productData = {
      title: "Test Product",
      description: "Test Description",
      price: 29.99,
      count: -5
    };

    const event = createMockEvent(productData);
    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Invalid product data");
    expect(body.errors).toContain("Count is required and must be a non-negative number");
  });

  it("returns 409 when transaction is cancelled due to conflict", async () => {
    const conflictError = new Error("Transaction cancelled");
    conflictError.name = "TransactionCanceledException";
    (conflictError as any).CancellationReasons = [
      { Code: "ConditionalCheckFailed" }
    ];

    mockSend.mockReset();
    mockSend.mockRejectedValue(conflictError);

    const productData = {
      title: "Test Product",
      description: "Test Description", 
      price: 29.99,
      count: 10
    };

    const event = createMockEvent(productData);
    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Product with this ID already exists or transaction conflict occurred");
  });

  it("returns 400 for DynamoDB validation errors", async () => {
    const validationError = new Error("Validation error");
    validationError.name = "ValidationException";

    mockSend.mockReset();
    mockSend.mockRejectedValue(validationError);

    const productData = {
      title: "Test Product",
      description: "Test Description",
      price: 29.99,
      count: 10
    };

    const event = createMockEvent(productData);
    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Invalid data format for database operation");
  });

  it("returns 503 for throttling errors", async () => {
    const throttlingError = new Error("Throttling error");
    throttlingError.name = "ProvisionedThroughputExceededException";

    mockSend.mockReset();
    mockSend.mockRejectedValue(throttlingError);

    const productData = {
      title: "Test Product",
      description: "Test Description",
      price: 29.99,
      count: 10
    };

    const event = createMockEvent(productData);
    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(503);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Service temporarily unavailable. Please try again later.");
  });

  it("returns 500 for generic database errors", async () => {
    const genericError = new Error("Generic database error");

    mockSend.mockReset();
    mockSend.mockRejectedValue(genericError);

    const productData = {
      title: "Test Product",
      description: "Test Description",
      price: 29.99,
      count: 10
    };

    const event = createMockEvent(productData);
    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Internal Server Error");
  });

  it("handles malformed JSON in request body", async () => {
    const event = createMockEvent(null);
    event.body = "invalid json";

    const result = await createProduct(event, mockContext, () => {}) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Internal Server Error");
  });
});