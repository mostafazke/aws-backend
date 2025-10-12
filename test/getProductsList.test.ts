// Mock AWS SDK - declare mock function first to avoid hoisting issues
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => ({
    send: mockSend
  })),
  ScanCommand: jest.fn()
}));

import { handler as getProductsList } from "../lib/handlers/getProductsList";
import { PRODUCTS } from "../data/products";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

const mockEvent: APIGatewayProxyEvent = {
  httpMethod: "GET",
  path: "/products",
  headers: {},
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  body: null,
  isBase64Encoded: false,
  pathParameters: null,
  stageVariables: null,
  resource: "",
  requestContext: {
    requestId: "test-request-id",
    stage: "test",
    resourceId: "",
    httpMethod: "GET",
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
};

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

describe("getProductsList handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses for successful tests
    mockSend
      .mockResolvedValueOnce({
        Items: PRODUCTS.map(p => ({
          id: { S: p.id },
          title: { S: p.title },
          description: { S: p.description || "" },
          price: { N: p.price.toString() },
          image: { S: p.image || "" }
        }))
      })
      .mockResolvedValueOnce({
        Items: PRODUCTS.map(p => ({
          product_id: { S: p.id },
          count: { N: p.count.toString() }
        }))
      });
  });

  it("returns all products with 200 status code", async () => {
    const result = await getProductsList(mockEvent, mockContext, () => {}) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(200);
    
    const body = JSON.parse(result.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(PRODUCTS.length);
  });

  it("returns products with correct structure", async () => {
    const result = await getProductsList(mockEvent, mockContext, () => {}) as APIGatewayProxyResult;
    const body = JSON.parse(result.body);
    
    // Check that each product has the required properties
    body.forEach((product: any) => {
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('title');
      expect(product).toHaveProperty('price');
      expect(product).toHaveProperty('count');
      expect(typeof product.id).toBe('string');
      expect(typeof product.title).toBe('string');
      expect(typeof product.price).toBe('number');
      expect(typeof product.count).toBe('number');
    });
  });

  it("returns non-empty products array", async () => {
    const result = await getProductsList(mockEvent, mockContext, () => {}) as APIGatewayProxyResult;
    const body = JSON.parse(result.body);
    
    expect(body.length).toBeGreaterThan(0);
  });

  it("handles database errors gracefully", async () => {
    mockSend.mockReset();
    mockSend.mockRejectedValue(new Error("Database error"));

    const result = await getProductsList(mockEvent, mockContext, () => {}) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Internal Server Error");
  });
});