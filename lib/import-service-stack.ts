import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as path from "path";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as dotenv from "dotenv";

interface ImportServiceStackProps extends cdk.StackProps {
  catalogItemsQueue: sqs.IQueue;
}

export class ImportServiceStack extends cdk.Stack {
  public readonly importBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ImportServiceStackProps) {
    super(scope, id, props);

    const { catalogItemsQueue } = props;

    if (!catalogItemsQueue) {
      throw new Error(
        "catalogItemsQueue must be provided to ImportServiceStack"
      );
    }

    // Load environment variables from .env file for basic authorizer
    const envConfig = dotenv.config({
      path: path.resolve(__dirname, "../../.env"),
    });

    const envVars: { [key: string]: string } = {};
    const validUsernamePattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;

    if (envConfig.parsed) {
      Object.entries(envConfig.parsed).forEach(([username, password]) => {
        if (username && password && validUsernamePattern.test(username)) {
          envVars[username] = password;
        }
      });
    }

    if (Object.keys(envVars).length === 0) {
      throw new Error(
        "No valid credentials found in .env file. " +
          "Please ensure .env file exists with format: username=password"
      );
    }

    console.log(
      `Loaded ${Object.keys(envVars).length} credential(s) from .env file`
    );

    // Create the basic authorizer lambda function
    const basicAuthorizerFn = new lambdaNodejs.NodejsFunction(
      this,
      "BasicAuthorizerFn",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(5),
        entry: path.join(process.cwd(), "lib/handlers/basicAuthorizer.ts"),
        handler: "handler",
        environment: envVars,
      }
    );

    this.importBucket = new s3.Bucket(this, "ImportBucket", {
      versioned: true,
      bucketName: `import-service-bucket-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          id: "DeleteIncompleteMultipartUploads",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const importProductsFileFn = new lambdaNodejs.NodejsFunction(
      this,
      "ImportProductsFileFn",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 1024,
        timeout: cdk.Duration.seconds(5),
        entry: path.join(process.cwd(), "lib/handlers/importProductsFile.ts"),
        handler: "handler",
        environment: {
          IMPORT_BUCKET_NAME: this.importBucket.bucketName,
        },
      }
    );

    const importFileParserFn = new lambdaNodejs.NodejsFunction(
      this,
      "ImportFileParserFn",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 1024,
        timeout: cdk.Duration.seconds(30),
        entry: path.join(process.cwd(), "lib/handlers/importFileParser.ts"),
        handler: "handler",
        environment: {
          IMPORT_BUCKET_NAME: this.importBucket.bucketName,
          CATALOG_ITEMS_QUEUE_URL: catalogItemsQueue.queueUrl,
        },
      }
    );

    this.importBucket.grantReadWrite(importProductsFileFn);
    this.importBucket.grantReadWrite(importFileParserFn);
    catalogItemsQueue.grantSendMessages(importFileParserFn);

    // API Gateway
    const api = new apigateway.RestApi(this, "ImportServiceApi", {
      restApiName: "Import Service API",
      description: "API for product import functionality",
    });

    // Create the Request Authorizer using the basic authorizer lambda
    const authorizer = new apigateway.RequestAuthorizer(
      this,
      "ImportBasicAuthorizer",
      {
        handler: basicAuthorizerFn,
        identitySources: [apigateway.IdentitySource.header("Authorization")],
        resultsCacheTtl: cdk.Duration.seconds(0), // Disable caching for testing
      }
    );

    const importResource = api.root.addResource("import");

    importResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(importProductsFileFn),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      }
    );

    // CORS support
    importResource.addCorsPreflight({
      allowOrigins: ["*"],
      allowMethods: ["GET", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "X-Amz-Date",
        "Authorization",
        "X-Api-Key",
        "X-Amz-Security-Token",
      ],
    });

    // S3 ObjectCreated event trigger
    this.importBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(importFileParserFn),
      { prefix: "uploaded/" }
    );

    new cdk.CfnOutput(this, "ImportBucketName", {
      value: this.importBucket.bucketName,
    });

    new cdk.CfnOutput(this, "ImportApiUrl", {
      value: api.url,
    });

    new cdk.CfnOutput(this, "BasicAuthorizerArn", {
      value: basicAuthorizerFn.functionArn,
      description: "ARN of the Basic Authorizer Lambda function",
    });
  }
}
