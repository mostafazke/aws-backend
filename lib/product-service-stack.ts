import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cdk from "aws-cdk-lib";
import * as path from "path";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class ProductServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productsTable = new dynamodb.Table(this, "ProductsTable", {
      tableName: "products",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
    });

    const stockTable = new dynamodb.Table(this, "StockTable", {
      tableName: "stock",
      partitionKey: { name: "product_id", type: dynamodb.AttributeType.STRING },
    });

    const getProductsListFn = new lambda.Function(this, "GetProductsListFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: "getProductsList.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
      environment: {
        PRODUCTS_TABLE: productsTable.tableName,
        STOCK_TABLE: stockTable.tableName,
      },
    });

    const getProductsByIdFn = new lambda.Function(this, "GetProductsByIdFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: "getProductsById.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
      environment: {
        PRODUCTS_TABLE: productsTable.tableName,
        STOCK_TABLE: stockTable.tableName,
      },
    });

    const createProductFn = new lambda.Function(this, "CreateProductFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: "createProduct.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
      environment: {
        PRODUCTS_TABLE: productsTable.tableName,
        STOCK_TABLE: stockTable.tableName,
      },
    });

    const api = new apigateway.RestApi(this, "ProductServiceApi", {
      restApiName: "Product Service API",
    });

    const productsResource = api.root.addResource("products");
    productsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsListFn)
    );
    productsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createProductFn)
    );
    productsResource.addCorsPreflight({
      allowOrigins: ["https://d8331wah0ee5g.cloudfront.net"],
      allowMethods: ["GET", "POST"],
    });

    const productByIdResource = productsResource.addResource("{productId}");
    productByIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsByIdFn)
    );
    productByIdResource.addCorsPreflight({
      allowOrigins: ["https://d8331wah0ee5g.cloudfront.net"],
      allowMethods: ["GET"],
    });

    productsTable.grantReadData(getProductsListFn);
    productsTable.grantReadData(getProductsByIdFn);
    productsTable.grantWriteData(createProductFn);
    stockTable.grantReadData(getProductsListFn);
    stockTable.grantReadData(getProductsByIdFn);
    stockTable.grantWriteData(createProductFn);

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
  }
}
