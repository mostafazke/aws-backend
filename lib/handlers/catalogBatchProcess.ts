import { SQSEvent, SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { Product } from "../../data/products";
import { ProductService } from "../services/productService";

const REGION = process.env.AWS_REGION || "us-east-1";
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const STOCK_TABLE = process.env.STOCK_TABLE;
const CREATE_PRODUCT_TOPIC_ARN = process.env.CREATE_PRODUCT_TOPIC_ARN;

const dynamoDBClient = new DynamoDBClient({ region: REGION });
const snsClient = new SNSClient({ region: REGION });

import { ProductInput } from "../services/productService";

export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  if (!PRODUCTS_TABLE || !STOCK_TABLE) {
    console.error(
      "Missing PRODUCTS_TABLE or STOCK_TABLE environment variables"
    );
    return;
  }

  const productService = new ProductService(
    dynamoDBClient,
    PRODUCTS_TABLE,
    STOCK_TABLE
  );
  const createdProducts: Array<Product> = [];

  for (const record of event.Records) {
    try {
      const payload: ProductInput = JSON.parse(record.body);
      const sanitizedInput = productService.sanitizeProductInput(payload);

      const validationErrors = productService.validateProduct(sanitizedInput);
      if (validationErrors.length > 0) {
        console.warn(
          `Skipping message ${record.messageId}: ${validationErrors.map(e => e.message).join(", ")}`
        );
        continue;
      }

      const createdProduct = await productService.createProduct(sanitizedInput);
      createdProducts.push(createdProduct);

      console.log(
        `Successfully created product ${createdProduct.id} from message ${record.messageId}`
      );
    } catch (error) {
      console.error(`Failed to process message ${record.messageId}:`, error);
    }
  }

  if (createdProducts.length === 0) {
    console.log("No products created in this batch; skipping SNS notification");
    return;
  }

  if (!CREATE_PRODUCT_TOPIC_ARN) {
    console.warn(
      "CREATE_PRODUCT_TOPIC_ARN environment variable is not set; unable to publish SNS notification"
    );
    return;
  }

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: CREATE_PRODUCT_TOPIC_ARN,
        Subject: `Catalog batch processed (${createdProducts.length})`,
        Message: JSON.stringify({
          products: createdProducts,
          total: createdProducts.length,
          timestamp: new Date().toISOString(),
        }),
      })
    );

    console.log(
      `Published SNS notification for ${createdProducts.length} created products`
    );
  } catch (error) {
    console.error("Failed to publish SNS notification:", error);
  }
};
