import { APIGatewayProxyHandler } from "aws-lambda";
import {
  DynamoDBClient,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
const uuidv4 = require("uuid").v4;

const client = new DynamoDBClient({ region: "us-east-1" });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://d8331wah0ee5g.cloudfront.net",
  "Access-Control-Allow-Credentials": "true",
};

export const main: APIGatewayProxyHandler = async (event) => {
  console.log("POST /products - Incoming request:", {
    httpMethod: event.httpMethod,
    path: event.path,
    body: event.body,
    headers: event.headers,
    requestId: event.requestContext?.requestId,
  });

  try {
    const body = JSON.parse(event.body || "{}");
    const { title, description, price, count, image } = body;

    console.log("Parsed request body:", { title, description, price, count, image });

    const validationErrors: string[] = [];

    if (!title || typeof title !== "string" || title.trim() === "") {
      validationErrors.push("Title is required and must be a non-empty string");
    }

    if (
      price === undefined ||
      price === null ||
      typeof price !== "number" ||
      price <= 0
    ) {
      validationErrors.push("Price is required and must be a positive number");
    }

    if (
      count === undefined ||
      count === null ||
      typeof count !== "number" ||
      count < 0
    ) {
      validationErrors.push(
        "Count is required and must be a non-negative number"
      );
    }

    if (validationErrors.length > 0) {
      console.log("Validation failed:", validationErrors);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({
          message: "Invalid product data",
          errors: validationErrors,
        }),
      };
    }

    const id = uuidv4();

    console.log("Creating product with ID using transaction:", id);
    console.log(
      "Transaction will ensure both product and stock records are created atomically"
    );

    const transactionCommand = new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: process.env.PRODUCTS_TABLE!,
            Item: {
              id: { S: id },
              title: { S: title },
              description: { S: description || "" },
              price: { N: price.toString() },
              ...(image && { image: { S: image } }),
            },
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
        {
          Put: {
            TableName: process.env.STOCK_TABLE!,
            Item: {
              product_id: { S: id },
              count: { N: count.toString() },
            },
            ConditionExpression: "attribute_not_exists(product_id)",
          },
        },
      ],
    });

    console.log("Executing DynamoDB transaction for product creation");
    await client.send(transactionCommand);

    const responseData = { id, title, description, price, count, ...(image && { image }) };
    console.log(
      "Product and stock created successfully in transaction:",
      responseData
    );

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify(responseData),
    };
  } catch (err: any) {
    console.error("Error in createProduct transaction:", err);
    console.error("Request details:", {
      body: event.body,
      method: event.httpMethod,
      path: event.path,
    });

    if (err.name === "TransactionCanceledException") {
      console.error(
        "Transaction was cancelled. One or more conditions failed:",
        err.CancellationReasons
      );

      const reasons = err.CancellationReasons || [];
      const hasDuplicateError = reasons.some(
        (reason: any) => reason.Code === "ConditionalCheckFailed"
      );

      if (hasDuplicateError) {
        return {
          statusCode: 409,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          body: JSON.stringify({
            message:
              "Product with this ID already exists or transaction conflict occurred",
          }),
        };
      }
    }

    if (err.name === "ValidationException") {
      console.error("DynamoDB validation error:", err.message);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({
          message: "Invalid data format for database operation",
        }),
      };
    }

    if (err.name === "ResourceNotFoundException") {
      console.error("DynamoDB table not found:", err.message);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({ message: "Database configuration error" }),
      };
    }

    if (
      err.name === "ProvisionedThroughputExceededException" ||
      err.name === "ThrottlingException"
    ) {
      console.error("DynamoDB throttling error:", err.message);
      return {
        statusCode: 503, // Service Unavailable
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({
          message: "Service temporarily unavailable. Please try again later.",
        }),
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
