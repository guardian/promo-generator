import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { PromoGenerator } from "./promo-generator";

describe("The PromoGenerator stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new PromoGenerator(app, "PromoGenerator", { stack: "playground", stage: "TEST" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
