const CORS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

export const ok = <T>(body: T) => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify(body),
});

export const created = (body: unknown) => ({
  statusCode: 201,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify(body),
});

export const notFound = (message = "Not found") => ({
  statusCode: 404,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify({ error: { code: "NOT_FOUND", message } }),
});

export const badRequest = (message: string) => ({
  statusCode: 400,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify({ error: { code: "BAD_REQUEST", message } }),
});

export const serverError = (message = "Internal server error") => ({
  statusCode: 500,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }),
});

export const unauthorized = (message = "Unauthorized") => ({
  statusCode: 401,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify({ error: { code: "UNAUTHORIZED", message } }),
});
