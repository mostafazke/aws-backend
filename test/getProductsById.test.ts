// Mock AWS SDK - declare mock function first to avoid hoisting issues
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => ({
    send: mockSend
  })),
  ScanCommand: jest.fn()
}));

import { handler as getProductsById } from "../lib/handlers/getProductsById";
import { PRODUCTS } from "../data/products";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

const createMockEvent = (productId: string): APIGatewayProxyEvent => ({
  httpMethod: "GET",
  path: `/products/${productId}`,
  headers: {},
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  body: null,
  isBase64Encoded: false,
  pathParameters: { productId },
  stageVariables: null,
  resource: "",
  requestContext: {
    requestId: "test-request-id",
    stage: "test",
    resourceId: "",
    httpMethod: "GET",
    path: `/products/${productId}`,
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

describe("getProductsById handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockSend
      .mockResolvedValueOnce({
        Items: PRODUCTS.map(p => ({
          id: { S: p.id },
          title: { S: p.title },
          description: { S: p.description || "" },
          price: { N: p.price.toString() }
        }))
      })
      .mockResolvedValueOnce({
        Items: PRODUCTS.map(p => ({
          product_id: { S: p.id },
          count: { N: p.count.toString() }
        }))
      });
  });

  it("returns product when found", async () => {
    const productId = "7567ec4b-b10c-48c5-9345-fc73c48a80aa";
    const event = createMockEvent(productId);
    const result = await getProductsById(event, mockContext, () => {}) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.id).toBe(productId);
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('count');
  });

  it("returns 404 when product not found", async () => {
    mockSend.mockReset();
    mockSend
      .mockResolvedValueOnce({ Items: [] }) // Empty products response
      .mockResolvedValueOnce({ Items: [] }); // Empty stock response

    const event = createMockEvent("non-existent-id");
    const result = await getProductsById(event, mockContext, () => {}) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Product not found");
  });

  it("returns 400 when productId is missing", async () => {
    const event = createMockEvent("");
    event.pathParameters = null; // No path parameters
    
    const result = await getProductsById(event, mockContext, () => {}) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Missing productId");
  });

  it("handles database errors gracefully", async () => {
    mockSend.mockReset();
    mockSend.mockRejectedValue(new Error("Database error"));

    const event = createMockEvent("7567ec4b-b10c-48c5-9345-fc73c48a80aa");
    const result = await getProductsById(event, mockContext, () => {}) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Internal Server Error");
  });
});
