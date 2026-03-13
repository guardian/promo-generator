import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack, GuStringParameter } from "@guardian/cdk/lib/constructs/core";
import { Duration, type App } from "aws-cdk-lib";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { CachePolicy, Distribution, HttpVersion, PriceClass, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { GuCname } from "@guardian/cdk/lib/constructs/dns";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

const hostingDomain: Record<string, string> = {
  PROD: "promo-generator.gutools.co.uk",
  CODE: "promo-generator.code.dev-gutools.co.uk",
  DEV: "promo-generator.local.dev-gutools.co.uk",
};

const app = "promo-generator";

export class PromoGenerator extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const hostingBucket = new Bucket(this, "HostingBucket", {
      bucketName: "promo-generator-hosting",
      websiteIndexDocument: "index.html",
    });

    new StringParameter(this, "HostingBucketName", {
      parameterName: `/${this.stage}/${this.stack}/${app}/hosting-bucket`,
      stringValue: hostingBucket.bucketName,
      description: `The name of the S3 bucket used to host the promo-generator ${this.stage} static assets`
     }
    );
    
    const hostingCertArn = new GuStringParameter(this, "HostingCertArn", {
      fromSSM: true,
      default: `/${this.stage}/${this.stack}/${app}/GlobalCertArn`,
      description: `Certificate to use for the promo-generator ${this.stage}. This must reside in us-east-1`
    });
    const hostingCert = Certificate.fromCertificateArn(this, "HostingCert", hostingCertArn.valueAsString);

    const cloudFrontDistro = new Distribution(this, "PromoGeneratorDist", {
      certificate: hostingCert,
      defaultRootObject: "index.html",
      domainNames: [hostingDomain[this.stage]!],
      enableLogging: false,
      errorResponses: [],
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: new S3Origin(hostingBucket),
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      }
    });

    hostingBucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [
        new ServicePrincipal("cloudfront.amazonaws.com")
      ],
      actions: ["s3:GetObject"],
      resources: [hostingBucket.bucketArn + "/*"],
      conditions: {
        StringEquals: {
          "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/${cloudFrontDistro.distributionId}`
        }
      }
    }));

    new GuCname(this, "CnameRecord", {
      resourceRecord: cloudFrontDistro.distributionDomainName,
      domainName: hostingDomain[this.stage]!,
      ttl: Duration.minutes(5),
      app,
    });
  }
}
