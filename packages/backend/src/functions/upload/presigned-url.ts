import { APIGatewayProxyHandler } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { ok, badRequest, serverError } from "../../lib/response";

const s3 = new S3Client({ region: process.env.REGION });
const BUCKET = process.env.IMAGES_BUCKET!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub ?? "anonymous";
  const contentType = event.queryStringParameters?.contentType ?? "image/jpeg";

  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return badRequest("contentType must be image/jpeg, image/png, or image/webp");
  }

  const key = `${userId}/${uuidv4()}`;

  try {
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 300 } // 5 minutes
    );
    return ok({ uploadUrl, key, imageUrl: `https://${BUCKET}.s3.amazonaws.com/${key}` });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
