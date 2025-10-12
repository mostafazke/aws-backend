import { SQSEvent, Context, SQSRecord } from "aws-lambda";
import { ProductInput } from "../lib/services/productService";

// Mock AWS SDK clients
const mockTransactWriteItems = jest.fn();
const mockPublish = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => ({
    send: mockTransactWriteItems,
  })),
  TransactWriteItemsCommand: jest.fn((params) => params),
}));

jest.mock("@aws-sdk/client-sns", () => ({
  SNSClient: jest.fn(() => ({
    send: mockPublish,
  })),
  PublishCommand: jest.fn((params) => params),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "test-uuid-123"),
}));

// Mock console methods
const consoleSpy = {
  log: jest.spyOn(console, "log").mockImplementation(),
  error: jest.spyOn(console, "error").mockImplementation(),
  warn: jest.spyOn(console, "warn").mockImplementation(),
};

// Helper function to call handler with proper signature
const callHandler = async (event: SQSEvent): Promise<void> => {
  const { handler } = require("../lib/handlers/catalogBatchProcess");
  const mockContext = {} as Context;
  const mockCallback = jest.fn();
  await handler(event, mockContext, mockCallback);
};

describe("catalogBatchProcess", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear only the AWS SDK mocks, not console mocks
    mockTransactWriteItems.mockClear();
    mockPublish.mockClear();

    // Clear console spy history
    consoleSpy.log.mockClear();
    consoleSpy.error.mockClear();
    consoleSpy.warn.mockClear();

    jest.resetModules(); // Reset modules to re-read environment variables

    // Set default environment variables
    process.env = {
      ...originalEnv,
      AWS_REGION: "us-east-1",
      PRODUCTS_TABLE: "test-products-table",
      STOCK_TABLE: "test-stock-table",
      CREATE_PRODUCT_TOPIC_ARN: "arn:aws:sns:us-east-1:123456789012:test-topic",
    };

    mockTransactWriteItems.mockResolvedValue({});
    mockPublish.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  const createSQSEvent = (records: ProductInput[]): SQSEvent => ({
    Records: records.map(
      (body, index) =>
        ({
          messageId: `msg-${index}`,
          receiptHandle: `handle-${index}`,
          body: JSON.stringify(body),
          attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1545082649183",
            SenderId: "AIDAIENQZJOLO23YVJ4VO",
            ApproximateFirstReceiveTimestamp: "1545082649185",
          },
          messageAttributes: {},
          md5OfBody: "",
          eventSource: "aws:sqs" as const,
          eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test-queue",
          awsRegion: "us-east-1",
        } as SQSRecord)
    ),
  });

  describe("Environment Variables", () => {
    it("should return early if PRODUCTS_TABLE is missing", async () => {
      delete process.env.PRODUCTS_TABLE;

      const event = createSQSEvent([
        { title: "Test Product", price: 10, count: 5 },
      ]);

      await callHandler(event);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Missing PRODUCTS_TABLE or STOCK_TABLE environment variables"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });

    it("should return early if STOCK_TABLE is missing", async () => {
      delete process.env.STOCK_TABLE;
      jest.resetModules();

      const event = createSQSEvent([
        { title: "Test Product", price: 10, count: 5 },
      ]);

      await callHandler(event);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Missing PRODUCTS_TABLE or STOCK_TABLE environment variables"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });
  });

  describe("Valid Product Processing", () => {
    it("should successfully process a valid product with all fields", async () => {
      const product = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
        image: "https://example.com/image.jpg",
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(mockTransactWriteItems).toHaveBeenCalledWith({
        TransactItems: [
          {
            Put: {
              TableName: "test-products-table",
              Item: {
                id: { S: "test-uuid-123" },
                title: { S: "Test Product" },
                description: { S: "Test Description" },
                price: { N: "29.99" },
                image: { S: "https://example.com/image.jpg" },
              },
              ConditionExpression: "attribute_not_exists(id)",
            },
          },
          {
            Put: {
              TableName: "test-stock-table",
              Item: {
                product_id: { S: "test-uuid-123" },
                count: { N: "10" },
              },
              ConditionExpression: "attribute_not_exists(product_id)",
            },
          },
        ],
      });

      expect(mockPublish).toHaveBeenCalledWith({
        TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
        Subject: "Catalog batch processed (1)",
        Message: expect.stringContaining("test-uuid-123"),
      });

      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Successfully created product test-uuid-123 from message msg-0"
      );
    });

    it("should process a product without optional fields", async () => {
      const product = {
        title: "Minimal Product",
        price: 15.5,
        count: 3,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(mockTransactWriteItems).toHaveBeenCalledWith({
        TransactItems: [
          {
            Put: {
              TableName: "test-products-table",
              Item: {
                id: { S: "test-uuid-123" },
                title: { S: "Minimal Product" },
                description: { S: "" },
                price: { N: "15.5" },
              },
              ConditionExpression: "attribute_not_exists(id)",
            },
          },
          {
            Put: {
              TableName: "test-stock-table",
              Item: {
                product_id: { S: "test-uuid-123" },
                count: { N: "3" },
              },
              ConditionExpression: "attribute_not_exists(product_id)",
            },
          },
        ],
      });
    });

    it("should default count to 0 when undefined", async () => {
      const product = {
        title: "No Count Product",
        price: 25.0,
        count: 1,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(mockTransactWriteItems).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactItems: expect.arrayContaining([
            expect.objectContaining({
              Put: expect.objectContaining({
                TableName: "test-stock-table",
                Item: {
                  product_id: { S: "test-uuid-123" },
                  count: { N: "0" },
                },
              }),
            }),
          ]),
        })
      );
    });

    it("should trim whitespace from title", async () => {
      const product = {
        title: "  Whitespace Product  ",
        price: 20.0,
      } as any;

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(mockTransactWriteItems).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactItems: expect.arrayContaining([
            expect.objectContaining({
              Put: expect.objectContaining({
                TableName: "test-products-table",
                Item: expect.objectContaining({
                  title: { S: "Whitespace Product" },
                }),
              }),
            }),
          ]),
        })
      );
    });
  });

  describe("Invalid Product Handling", () => {
    it("should skip products with missing title", async () => {
      const product = {
        price: 10.0,
        count: 5,
      } as any;

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Skipping message msg-0: Title is required and must be a non-empty string"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it("should skip products with empty title", async () => {
      const product = {
        title: "   ",
        price: 10.0,
        count: 5,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Skipping message msg-0: Title is required and must be a non-empty string"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });

    it("should skip products with invalid price (zero)", async () => {
      const product = {
        title: "Zero Price Product",
        price: 0,
        count: 5,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Skipping message msg-0: Price is required and must be a positive number"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });

    it("should skip products with invalid price (negative)", async () => {
      const product = {
        title: "Negative Price Product",
        price: -10,
        count: 5,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Skipping message msg-0: Price is required and must be a positive number"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });

    it("should skip products with invalid price (NaN)", async () => {
      const product = {
        title: "NaN Price Product",
        price: "invalid",
        count: 5,
      } as any;

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Skipping message msg-0: Price is required and must be a positive number"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });

    it("should skip products with invalid count (negative)", async () => {
      const product = {
        title: "Negative Count Product",
        price: 15.0,
        count: -5,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Skipping message msg-0: Count is required and must be a non-negative number"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });

    it("should skip products with invalid count (NaN)", async () => {
      const product = {
        title: "NaN Count Product",
        price: 15.0,
        count: "invalid",
      } as any;

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Skipping message msg-0: Count is required and must be a non-negative number"
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle DynamoDB transaction errors", async () => {
      mockTransactWriteItems.mockRejectedValueOnce(new Error("DynamoDB Error"));

      const product = {
        title: "Test Product",
        price: 10.0,
        count: 5,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Failed to process message msg-0:",
        expect.any(Error)
      );
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it("should handle SNS publish errors but continue processing", async () => {
      mockPublish.mockRejectedValueOnce(new Error("SNS Error"));

      const product = {
        title: "Test Product",
        price: 10.0,
        count: 5,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(mockTransactWriteItems).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Failed to publish SNS notification:",
        expect.any(Error)
      );
    });

    it("should handle malformed JSON in SQS message", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-0",
            receiptHandle: "handle-0",
            body: "invalid json",
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1545082649183",
              SenderId: "AIDAIENQZJOLO23YVJ4VO",
              ApproximateFirstReceiveTimestamp: "1545082649185",
            },
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs" as const,
            eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test-queue",
            awsRegion: "us-east-1",
          } as SQSRecord,
        ],
      };

      await callHandler(event);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Failed to process message msg-0:",
        expect.any(Error)
      );
      expect(mockTransactWriteItems).not.toHaveBeenCalled();
    });
  });

  describe("Batch Processing", () => {
    it("should process multiple valid products", async () => {
      const products = [
        { title: "Product 1", price: 10.0, count: 5 },
        { title: "Product 2", price: 20.0, count: 3 },
      ];

      // Mock UUID to return different values for each call
      const { v4: mockUuid } = require("uuid");
      mockUuid.mockReturnValueOnce("uuid-1").mockReturnValueOnce("uuid-2");

      const event = createSQSEvent(products);
      await callHandler(event);

      expect(mockTransactWriteItems).toHaveBeenCalledTimes(2);
      expect(mockPublish).toHaveBeenCalledWith({
        TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
        Subject: "Catalog batch processed (2)",
        Message: expect.stringContaining("uuid-1"),
      });
    });

    it("should process valid products and skip invalid ones", async () => {
      const products = [
        { title: "Valid Product", price: 10.0, count: 5 },
        { title: "", price: 20.0, count: 3 }, // Invalid: empty title
        { title: "Another Valid", price: 15.0, count: 2 },
      ];

      const { v4: mockUuid } = require("uuid");
      mockUuid.mockReturnValueOnce("uuid-1").mockReturnValueOnce("uuid-3");

      const event = createSQSEvent(products);
      await callHandler(event);

      expect(mockTransactWriteItems).toHaveBeenCalledTimes(2);
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Skipping message msg-1: Title is required and must be a non-empty string"
      );
      expect(mockPublish).toHaveBeenCalledWith({
        TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
        Subject: "Catalog batch processed (2)",
        Message: expect.stringContaining("uuid-1"),
      });
    });

    it("should not publish SNS if no products are created", async () => {
      const products = [
        { title: "", price: 10.0, count: 5 }, // Invalid: empty title
        { price: 20.0, count: 3 }, // Invalid: no title
      ] as any[];

      const event = createSQSEvent(products);
      await callHandler(event);

      expect(mockTransactWriteItems).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        "No products created in this batch; skipping SNS notification"
      );
    });
  });

  describe("SNS Integration", () => {
    it("should warn if CREATE_PRODUCT_TOPIC_ARN is not set", async () => {
      delete process.env.CREATE_PRODUCT_TOPIC_ARN;

      const product = {
        title: "Test Product",
        price: 10.0,
        count: 5,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(mockTransactWriteItems).toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "CREATE_PRODUCT_TOPIC_ARN environment variable is not set; unable to publish SNS notification"
      );
    });

    it("should publish correct SNS message format", async () => {
      const product = {
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
        image: "https://example.com/image.jpg",
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(mockPublish).toHaveBeenCalledWith({
        TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
        Subject: "Catalog batch processed (1)",
        Message: expect.stringMatching(
          /"products":\[.*\].*"total":1.*"timestamp":/
        ),
      });

      const publishCall = mockPublish.mock.calls[0][0];
      const message = JSON.parse(publishCall.Message);
      expect(message.products).toHaveLength(1);
      expect(message.products[0]).toEqual({
        id: "test-uuid-123",
        title: "Test Product",
        description: "Test Description",
        price: 29.99,
        count: 10,
        image: "https://example.com/image.jpg",
      });
      expect(message.total).toBe(1);
      expect(message.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should log successful SNS publication", async () => {
      const product = {
        title: "Test Product",
        price: 10.0,
        count: 5,
      };

      const event = createSQSEvent([product]);
      await callHandler(event);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Published SNS notification for 1 created products"
      );
    });
  });
});
