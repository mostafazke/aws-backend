import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as path from "path";
import { Construct } from "constructs";

export class ImportServiceStack extends cdk.Stack {
  public readonly importBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    const importProductsFileFn = new lambda.Function(
      this,
      "ImportProductsFileFn",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 1024,
        timeout: cdk.Duration.seconds(5),
        handler: "importProductsFile.handler",
        code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
        environment: {
          IMPORT_BUCKET_NAME: this.importBucket.bucketName,
        },
      }
    );

    const importFileParserFn = new lambda.Function(this, "ImportFileParserFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      handler: "importFileParser.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
      environment: {
        IMPORT_BUCKET_NAME: this.importBucket.bucketName,
      },
    });

    this.importBucket.grantReadWrite(importProductsFileFn);
    this.importBucket.grantReadWrite(importFileParserFn);

    // API Gateway
    const api = new apigateway.RestApi(this, "ImportServiceApi", {
      restApiName: "Import Service API",
      description: "API for product import functionality",
    });

    const importResource = api.root.addResource("import");

    importResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(importProductsFileFn)
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
  }
}
