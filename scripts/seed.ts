import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
const uuidv4 = require("uuid").v4;
import { PRODUCTS } from "../data/products";

const client = new DynamoDBClient({ region: "us-east-1" });

async function seed() {
  for (const product of PRODUCTS) {
    const existingProduct = await client.send(
      new GetItemCommand({
        TableName: "products",
        Key: {
          id: { S: product.id },
        },
      })
    );

    if (existingProduct.Item) {
      console.log(`Product ${product.title} already exists, skipping...`);
      continue;
    }

    // Use the predefined ID from the products data instead of generating a new one
    const productId = product.id;

    await client.send(
      new PutItemCommand({
        TableName: "products",
        Item: {
          id: { S: productId },
          title: { S: product.title },
          description: { S: product.description || "" },
          price: { N: product.price.toString() },
          image: { S: product.image || "" },
        },
      })
    );

    await client.send(
      new PutItemCommand({
        TableName: "stock",
        Item: {
          product_id: { S: productId },
          count: { N: product.count.toString() },
        },
      })
    );

    console.log(`Seeded product ${product.title}`);
  }
}

seed().catch(console.error);
