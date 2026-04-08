import { APIGatewayProxyHandler } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, notFound, serverError } from "../../lib/response";

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub ?? "anonymous";
  const id = event.pathParameters?.id;

  if (!id) return notFound();

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { userId, id },
        ConditionExpression: "attribute_exists(id)",
      })
    );
    return ok({ success: true });
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") return notFound();
    console.error(err);
    return serverError();
  }
};
