import { APIGatewayProxyHandler } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, badRequest, notFound, serverError, unauthorized } from "../../lib/response";
import type { UpdateCouponInput } from "@coupon/shared";

const s3 = new S3Client({ region: process.env.REGION ?? "us-east-1" });
const BUCKET = process.env.IMAGES_BUCKET!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) return unauthorized();
  const id = event.pathParameters?.id;

  if (!id) return notFound();

  let input: UpdateCouponInput;
  try {
    input = JSON.parse(event.body ?? "");
  } catch {
    return badRequest("Invalid JSON body");
  }

  const fields = Object.entries(input).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return badRequest("No fields to update");

  const updateExpr =
    "SET " +
    fields.map(([k]) => `#${k} = :${k}`).join(", ") +
    ", updatedAt = :updatedAt";
  const exprNames = Object.fromEntries(fields.map(([k]) => [`#${k}`, k]));
  const exprValues = Object.fromEntries(
    fields.map(([k, v]) => [`:${k}`, v])
  );
  exprValues[":updatedAt"] = new Date().toISOString();

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { userId, id },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "ALL_NEW",
      })
    );
    const item = result.Attributes as Record<string, any>;
    if (item && item.status === undefined) item.status = "active";

    // Generate presigned GET URL for QR crop image (1-hour expiry)
    if (item?.qrImageS3Key) {
      try {
        item.qrImageUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET, Key: item.qrImageS3Key }),
          { expiresIn: 3600 }
        );
      } catch (err) {
        console.warn("Failed to generate presigned URL for qrImageS3Key:", err);
      }
    }

    return ok(item);
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") return notFound();
    console.error(err);
    return serverError();
  }
};
