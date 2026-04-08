import { APIGatewayProxyHandler } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { created, badRequest, serverError } from "../../lib/response";
import type { CreateCouponInput, Coupon } from "@coupon/shared";

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub ?? "anonymous";

  let input: CreateCouponInput;
  try {
    input = JSON.parse(event.body ?? "");
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!input.code || !input.title || !input.store || !input.discount) {
    return badRequest("Missing required fields: code, title, store, discount");
  }

  const now = new Date().toISOString();
  const coupon: Coupon = {
    id: uuidv4(),
    userId,
    code: input.code,
    title: input.title,
    description: input.description,
    discount: input.discount,
    store: input.store,
    category: input.category ?? "other",
    expiresAt: input.expiresAt,
    isActive: true,
    usageCount: 0,
    maxUsage: input.maxUsage,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: coupon }));
    return created(coupon);
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
