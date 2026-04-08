import { APIGatewayProxyHandler } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, notFound, serverError } from "../../lib/response";

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub ?? "anonymous";
  const id = event.pathParameters?.id;

  if (!id) return notFound();

  try {
    const result = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId, id } })
    );

    if (!result.Item) return notFound();
    return ok(result.Item);
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
