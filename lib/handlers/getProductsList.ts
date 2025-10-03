import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";

const client = new DynamoDBClient({ region: "us-east-1" });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://d8331wah0ee5g.cloudfront.net",
  "Access-Control-Allow-Credentials": "true",
};

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log("GET /products - Incoming request:", {
    httpMethod: event.httpMethod,
    path: event.path,
    queryStringParameters: event.queryStringParameters,
    headers: event.headers,
    requestId: event.requestContext?.requestId
  });

  try {
    console.log("Fetching products from DynamoDB tables");
    
    const productsRes = await client.send(
      new ScanCommand({ TableName: "products" })
    );
    const stockRes = await client.send(new ScanCommand({ TableName: "stock" }));

    console.log(`Found ${productsRes.Items?.length || 0} products and ${stockRes.Items?.length || 0} stock items`);

    const products = productsRes.Items?.map((p) => ({
      id: p.id.S,
      title: p.title.S,
      description: p.description.S,
      price: Number(p.price.N),
      count: Number(stockRes.Items?.find((s) => s.product_id.S === p.id.S)?.count.N) || 0,
      image: p.image.S,
    }));

    console.log("Successfully processed products list:", products?.length || 0, "products");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
      body: JSON.stringify(products),
    };
  } catch (err) {
    console.error("Error in getProductsList:", err);
    console.error("Request details:", {
      method: event.httpMethod,
      path: event.path,
      requestId: event.requestContext?.requestId
    });
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
