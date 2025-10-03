import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyHandler } from "aws-lambda";

const client = new DynamoDBClient({ region: "us-east-1" });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://d8331wah0ee5g.cloudfront.net",
  "Access-Control-Allow-Credentials": "true",
};

export const handler: APIGatewayProxyHandler = async (event: APIGatewayEvent) => {
  // Log incoming request and arguments
  console.log("GET /products/{productId} - Incoming request:", {
    httpMethod: event.httpMethod,
    path: event.path,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters,
    headers: event.headers,
    requestId: event.requestContext?.requestId
  });

  try {
    const productId = event.pathParameters?.productId;
    console.log("Looking for product with ID:", productId);
    
    if (!productId) {
      console.log("Missing productId in path parameters");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({ message: "Missing productId" }),
      };
    }

    console.log("Fetching products and stock data from DynamoDB");

    const productsRes = await client.send(
      new ScanCommand({ TableName: "products" })
    );
    const stockRes = await client.send(new ScanCommand({ TableName: "stock" }));

    console.log(`Scanned ${productsRes.Items?.length || 0} products and ${stockRes.Items?.length || 0} stock items`);

    const product = productsRes.Items?.find((p) => p.id.S === productId);
    if (!product) {
      console.log("Product not found for ID:", productId);
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify({ message: "Product not found" }),
      };
    }

    const stockItem = stockRes.Items?.find((s) => s.product_id.S === productId);
    const productWithStock = {
      id: product.id.S,
      title: product.title.S,
      description: product.description.S,
      price: Number(product.price.N),
      count: stockItem ? Number(stockItem.count.N) : 0,
      image: product.image.S,
    };

    console.log("Successfully found product:", productWithStock);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify(productWithStock),
    };
  } catch (err) {
    console.error("Error in getProductsById:", err);
    console.error("Request details:", {
      pathParameters: event.pathParameters,
      method: event.httpMethod,
      path: event.path,
      requestId: event.requestContext?.requestId
    });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
