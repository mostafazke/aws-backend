import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cdk from "aws-cdk-lib";
import * as path from "path";
import { Construct } from "constructs";

export class ProductServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const getProductsListFn = new lambda.Function(this, "GetProductsListFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: "getProductsList.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
    });

    const getProductsByIdFn = new lambda.Function(this, "GetProductsByIdFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: "getProductsById.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "./handlers")),
    });

    const api = new apigateway.RestApi(this, "ProductServiceApi", {
      restApiName: "Product Service API",
    });

    const productsResource = api.root.addResource("products");
    productsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsListFn)
    );
    productsResource.addCorsPreflight({
      allowOrigins: ["https://d8331wah0ee5g.cloudfront.net"],
      allowMethods: ["GET"],
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

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
  }
}
