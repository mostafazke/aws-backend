import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ProductService } from "../services/productService";

const client = new DynamoDBClient({ region: "us-east-1" });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://dlyghcisi7wvo.cloudfront.net",
  "Access-Control-Allow-Credentials": "true",
};

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log("POST /products - Incoming request:", {
    httpMethod: event.httpMethod,
    path: event.path,
    body: event.body,
    headers: event.headers,
    requestId: event.requestContext?.requestId,
  });

  try {
    const body = JSON.parse(event.body || "{}");
    console.log("Parsed request body:", body);

    const productService = new ProductService(
      client,
      process.env.PRODUCTS_TABLE!,
      process.env.STOCK_TABLE!
    );

    const sanitizedInput = productService.sanitizeProductInput(body);
    const validationErrors = productService.validateProduct(sanitizedInput);

    if (validationErrors.length > 0) {
      console.log("Validation failed:", validationErrors);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({
          message: "Invalid product data",
          errors: validationErrors.map(e => e.message),
        }),
      };
    }

    console.log("Creating product using transaction");
    console.log("Transaction will ensure both product and stock records are created atomically");

    const createdProduct = await productService.createProduct(sanitizedInput);

    console.log("Product and stock created successfully in transaction:", createdProduct);

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify(createdProduct),
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
