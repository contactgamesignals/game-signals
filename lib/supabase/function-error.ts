type ErrorPayload = {
  error?: unknown;
  message?: unknown;
};

type FunctionErrorLike = {
  message?: unknown;
  context?: unknown;
};

function payloadMessage(payload: ErrorPayload | null) {
  if (!payload) return null;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  return null;
}

export async function edgeFunctionErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;

  const functionError = error as FunctionErrorLike;
  const context = functionError.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as ErrorPayload;
      const detailed = payloadMessage(payload);
      if (detailed) return detailed;
    } catch {
      // Fall back to the SDK message below when the response has no JSON body.
    }
  }

  return typeof functionError.message === "string" && functionError.message.trim()
    ? functionError.message
    : fallback;
}
