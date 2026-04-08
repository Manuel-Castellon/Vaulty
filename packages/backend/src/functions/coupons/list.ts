import { APIGatewayProxyHandler } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, serverError } from "../../lib/response";

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub ?? "anonymous";
  const limit = event.queryStringParameters?.limit
    ? parseInt(event.queryStringParameters.limit)
    : 50;

  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        Limit: limit,
        ExclusiveStartKey: event.queryStringParameters?.nextToken
          ? JSON.parse(
              Buffer.from(
                event.queryStringParameters.nextToken,
                "base64"
              ).toString()
            )
          : undefined,
      })
    );

    return ok({
      items: result.Items ?? [],
      nextToken: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
            "base64"
          )
        : undefined,
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
