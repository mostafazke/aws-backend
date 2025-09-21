import { handler as getProductsList } from "../lib/handlers/getProductsList";
import { PRODUCTS } from "../lib/handlers/products";

describe("getProductsList handler", () => {
  it("returns all products with 200 status code", async () => {
    const result = await getProductsList();
    
    expect(result.statusCode).toBe(200);
    
    const body = JSON.parse(result.body);
    expect(body).toEqual(PRODUCTS);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(PRODUCTS.length);
  });

  it("returns products with correct structure", async () => {
    const result = await getProductsList();
    const body = JSON.parse(result.body);
    
    // Check that each product has the required properties
    body.forEach((product: any) => {
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('title');
      expect(product).toHaveProperty('price');
      expect(product).toHaveProperty('count');
      expect(typeof product.id).toBe('string');
      expect(typeof product.title).toBe('string');
      expect(typeof product.price).toBe('number');
      expect(typeof product.count).toBe('number');
    });
  });

  it("returns non-empty products array", async () => {
    const result = await getProductsList();
    const body = JSON.parse(result.body);
    
    expect(body.length).toBeGreaterThan(0);
  });

  it("returns consistent data on multiple calls", async () => {
    const result1 = await getProductsList();
    const result2 = await getProductsList();
    
    expect(result1.statusCode).toBe(result2.statusCode);
    expect(result1.body).toBe(result2.body);
  });
});