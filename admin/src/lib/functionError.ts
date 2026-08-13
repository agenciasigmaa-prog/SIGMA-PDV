export async function describeFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        if (body?.error) return String(body.error);
      } catch {
        // response body wasn't JSON — fall through to the generic message
      }
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
