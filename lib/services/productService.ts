import {
  DynamoDBClient,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import { Product } from "../../data/products";
const uuidv4 = require("uuid").v4;

export interface ProductInput {
  title: string;
  description?: string;
  price: number;
  count: number;
  image?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export class ProductService {
  private dynamoDBClient: DynamoDBClient;
  private productsTable: string;
  private stockTable: string;

  constructor(
    dynamoDBClient: DynamoDBClient,
    productsTable: string,
    stockTable: string
  ) {
    this.dynamoDBClient = dynamoDBClient;
    this.productsTable = productsTable;
    this.stockTable = stockTable;
  }

  validateProduct(productInput: Partial<ProductInput>): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!productInput.title || typeof productInput.title !== "string" || productInput.title.trim() === "") {
      errors.push({
        field: "title",
        message: "Title is required and must be a non-empty string"
      });
    }

    if (
      productInput.price === undefined ||
      productInput.price === null ||
      typeof productInput.price !== "number" ||
      productInput.price <= 0
    ) {
      errors.push({
        field: "price",
        message: "Price is required and must be a positive number"
      });
    }

    if (
      productInput.count === undefined ||
      productInput.count === null ||
      typeof productInput.count !== "number" ||
      productInput.count < 0
    ) {
      errors.push({
        field: "count",
        message: "Count is required and must be a non-negative number"
      });
    }

    return errors;
  }

  sanitizeProductInput(input: unknown): ProductInput {
    if (
      typeof input === "object" &&
      input !== null &&
      "title" in input &&
      "price" in input &&
      "count" in input
    ) {
      const obj = input as { [key: string]: unknown };
      return {
        title: typeof obj.title === "string" ? obj.title.trim() : "",
        description: typeof obj.description === "string" ? obj.description : "",
        price: Number(obj.price),
        count: obj.count === undefined ? 0 : Number(obj.count),
        image: typeof obj.image === "string" && obj.image.trim() !== "" ? obj.image : undefined,
      };
    }
    throw new Error("Invalid product input structure");
  }

  async createProduct(productInput: ProductInput): Promise<Product> {
    const validationErrors = this.validateProduct(productInput);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(", ")}`);
    }

    const id = uuidv4();

    const transactionCommand = new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: this.productsTable,
            Item: {
              id: { S: id },
              title: { S: productInput.title },
              description: { S: productInput.description || "" },
              price: { N: productInput.price.toString() },
              ...(productInput.image ? { image: { S: productInput.image } } : {}),
            },
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
        {
          Put: {
            TableName: this.stockTable,
            Item: {
              product_id: { S: id },
              count: { N: productInput.count.toString() },
            },
            ConditionExpression: "attribute_not_exists(product_id)",
          },
        },
      ],
    });

    await this.dynamoDBClient.send(transactionCommand);

    return {
      id,
      title: productInput.title,
      description: productInput.description || "",
      price: productInput.price,
      count: productInput.count,
      ...(productInput.image ? { image: productInput.image } : {}),
    };
  }
}