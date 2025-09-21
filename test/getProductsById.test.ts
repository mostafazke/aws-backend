import { handler as getProductsById } from "../lib/handlers/getProductsById";

describe("getProductsById handler", () => {
  it("returns product when found", async () => {
    const event: any = { pathParameters: { productId: "7567ec4b-b10c-48c5-9345-fc73c48a80aa" } };
    const result = await getProductsById(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.id).toBe("7567ec4b-b10c-48c5-9345-fc73c48a80aa");
  });

  it("returns 404 when product not found", async () => {
    const event: any = { pathParameters: { productId: "not-exist" } };
    const result = await getProductsById(event);
    expect(result.statusCode).toBe(404);
  });
});
