import { APIGatewayEvent } from "aws-lambda";
import { PRODUCTS } from "./products";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://d8331wah0ee5g.cloudfront.net",
  "Access-Control-Allow-Credentials": "true",
};

export const handler = async (event: APIGatewayEvent) => {
  try {
    const productId = event.pathParameters?.productId;
    if (!productId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({ message: "Missing productId" }),
      };
    }

    const found = PRODUCTS.find((p) => p.id === productId);
    if (!found) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({ message: "Product not found" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify(found),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
