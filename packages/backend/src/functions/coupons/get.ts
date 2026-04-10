import { APIGatewayProxyHandler } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, notFound, serverError } from "../../lib/response";

const s3 = new S3Client({ region: process.env.REGION ?? "us-east-1" });
const BUCKET = process.env.IMAGES_BUCKET!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub ?? "anonymous";
  const id = event.pathParameters?.id;

  if (!id) return notFound();

  try {
    const result = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId, id } })
    );

    if (!result.Item) return notFound();
    const item = result.Item as Record<string, any>;
    if (item.status === undefined) item.status = "active";

    // Generate presigned GET URL for QR crop image (1-hour expiry)
    if (item.qrImageS3Key) {
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
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
