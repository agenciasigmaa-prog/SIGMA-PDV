import { describe, expect, it } from "vitest";
import { describeFunctionError } from "./functionError";

class FakeFunctionsHttpError extends Error {
  context: unknown;
  constructor(message: string, context: unknown) {
    super(message);
    this.context = context;
  }
}

describe("describeFunctionError", () => {
  it("extracts the error field from a Response body with JSON", async () => {
    const response = new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403 });
    const err = new FakeFunctionsHttpError("non-2xx status code", response);
    const result = await describeFunctionError(err);
    expect(result).toBe("Forbidden: admin role required");
  });

  it("falls back to the error message when the Response body isn't JSON", async () => {
    const response = new Response("not json", { status: 500 });
    const err = new FakeFunctionsHttpError("Edge Function returned a non-2xx status code", response);
    const result = await describeFunctionError(err);
    expect(result).toBe("Edge Function returned a non-2xx status code");
  });

  it("returns the message of a plain Error", async () => {
    const result = await describeFunctionError(new Error("network down"));
    expect(result).toBe("network down");
  });

  it("stringifies unknown error shapes", async () => {
    const result = await describeFunctionError("just a string");
    expect(result).toBe("just a string");
  });
});
