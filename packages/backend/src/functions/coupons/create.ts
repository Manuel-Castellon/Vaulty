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

  if (!input.code || !input.title || !input.store) {
    return badRequest("Missing required fields: code, title, store");
  }

  const now = new Date().toISOString();
  const coupon: Coupon = {
    id: uuidv4(),
    userId,
    itemType: input.itemType ?? "coupon",
    code: input.code,
    title: input.title,
    description: input.description,
    discount: input.discount,
    faceValue: input.faceValue,
    cost: input.cost,
    currency: input.currency,
    store: input.store,
    category: input.category ?? "other",
    expiresAt: input.expiresAt,
    eventDate: input.eventDate,
    seatInfo: input.seatInfo,
    conditions: input.conditions,
    status: input.status ?? "active",
    isActive: true,
    usageCount: 0,
    maxUsage: input.maxUsage,
    quantity: input.quantity,
    amountUsed: 0,
    imageUrl: input.imageUrl,
    qrCode: input.qrCode,
    qrImageS3Key: input.qrImageS3Key,
    extractionWarnings: input.extractionWarnings,
    issueDate: input.issueDate,
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
