import { PRODUCTS } from "./products";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://d8331wah0ee5g.cloudfront.net",
  "Access-Control-Allow-Credentials": "true",
};

export const handler = async () => {
  try {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
      body: JSON.stringify(PRODUCTS),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
