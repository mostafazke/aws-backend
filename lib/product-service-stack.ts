import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cdk from "aws-cdk-lib";
import * as path from "path";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class ProductServiceStack extends cdk.Stack {
  public readonly catalogItemsQueue: sqs.Queue;

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
      handler: "createProduct.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
      environment: {
        PRODUCTS_TABLE: productsTable.tableName,
        STOCK_TABLE: stockTable.tableName,
      },
    });

    this.catalogItemsQueue = new sqs.Queue(this, "catalog-items-queue", {
      queueName: "catalogItemsQueue",
    });

    const createProductTopic = new sns.Topic(this, "CreateProductTopic", {
      topicName: "createProductTopic",
    });

    const createProductNotificationEmail = new cdk.CfnParameter(
      this,
      "CreateProductNotificationEmail",
      {
        type: "String",
        description:
          "Email address that receives notifications about newly created products.",
        allowedPattern: "^.+@.+\\..+$",
        constraintDescription: "Must be a valid email address.",
      }
    );

    createProductTopic.addSubscription(
      new subscriptions.EmailSubscription(
        createProductNotificationEmail.valueAsString
      )
    );

    const catalogBatchProcessLambda = new lambda.Function(
      this,
      "catalog-batch-process",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 1024,
        timeout: cdk.Duration.seconds(60),
        handler: "catalogBatchProcess.handler",
        code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
        environment: {
          PRODUCTS_TABLE: productsTable.tableName,
          STOCK_TABLE: stockTable.tableName,
          CREATE_PRODUCT_TOPIC_ARN: createProductTopic.topicArn,
        },
      }
    );

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
    productsTable.grantWriteData(catalogBatchProcessLambda);
    stockTable.grantReadData(getProductsListFn);
    stockTable.grantReadData(getProductsByIdFn);
    stockTable.grantWriteData(createProductFn);
    stockTable.grantWriteData(catalogBatchProcessLambda);

    createProductTopic.grantPublish(catalogBatchProcessLambda);

    catalogBatchProcessLambda.addEventSource(
      new SqsEventSource(this.catalogItemsQueue, { batchSize: 5 })
    );

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "CatalogItemsQueueUrl", {
      value: this.catalogItemsQueue.queueUrl,
    });
    new cdk.CfnOutput(this, "CreateProductTopicArn", {
      value: createProductTopic.topicArn,
    });
  }
}
