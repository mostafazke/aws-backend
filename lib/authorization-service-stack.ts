import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { Construct } from "constructs";
import * as dotenv from "dotenv";

export class AuthorizationServiceStack extends cdk.Stack {
  public readonly basicAuthorizerFn: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    dotenv.config({ path: path.resolve(__dirname, "../../.env") });

    // Get credentials from .env file
    const envVars: { [key: string]: string } = {};
  
    Object.keys(process.env).forEach(key => {
      if (key && process.env[key] && key !== 'PATH' && key !== 'HOME' && !key.startsWith('npm_') && !key.startsWith('AWS_')) {
        envVars[key] = process.env[key]!;
      }
    });

    this.basicAuthorizerFn = new lambda.Function(this, "BasicAuthorizerFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(5),
      handler: "basicAuthorizer.handler",
      code: lambda.Code.fromAsset(path.resolve(__dirname, "../../lib/handlers")),
      environment: envVars,
    });

    new cdk.CfnOutput(this, "BasicAuthorizerArn", {
      value: this.basicAuthorizerFn.functionArn,
      description: "ARN of the Basic Authorizer Lambda function",
    });
  }
}