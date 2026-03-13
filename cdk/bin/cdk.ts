import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import { PromoGenerator } from "../lib/promo-generator";

const app = new GuRoot();
new PromoGenerator(app, "PromoGenerator-euwest-1-CODE", { stack: "playground", stage: "CODE", env: { region: "eu-west-1" } });
new PromoGenerator(app, "PromoGenerator-euwest-1-PROD", { stack: "playground", stage: "PROD", env: { region: "eu-west-1" } });
