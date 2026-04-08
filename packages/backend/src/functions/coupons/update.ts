import { APIGatewayProxyHandler } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, badRequest, notFound, serverError } from "../../lib/response";
import type { UpdateCouponInput } from "@coupon/shared";

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub ?? "anonymous";
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
    return ok(result.Attributes);
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") return notFound();
    console.error(err);
    return serverError();
  }
};
