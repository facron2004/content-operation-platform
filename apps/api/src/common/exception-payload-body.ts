export function buildExceptionBodyFields(
  params: {
    status: number;
    message: string;
    details: unknown;
    path?: string;
    isProduction: boolean;
  },
  timestamp: string
) {
  const body: Record<string, unknown> = {
    statusCode: params.status,
    message: params.message,
    timestamp,
    path: params.path
  };
  if (params.details && !params.isProduction) body.details = params.details;
  return body;
}
