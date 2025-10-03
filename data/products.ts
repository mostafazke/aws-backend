export type Product = {
  id: string;
  title: string;
  price: number;
  count: number;
  description?: string;
  image?: string;
};

export const PRODUCTS: Product[] = [
  {
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80aa",
    title: "Premium Wireless Bluetooth Headphones",
    price: 299.99,
    count: 15,
    description:
      "High-quality noise-canceling wireless headphones with 30-hour battery life, premium sound quality, and comfortable over-ear design. Perfect for music lovers and professionals.",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
  },
  {
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80a0",
    title: "Organic Cotton T-Shirt",
    price: 24.99,
    count: 50,
    description:
      "Comfortable and sustainable organic cotton t-shirt made from 100% certified organic materials. Available in multiple colors and sizes. Perfect for everyday wear.",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400",
  },
  {
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80a2",
    title: "Smart Fitness Watch",
    price: 199.99,
    count: 25,
    description:
      "Advanced fitness tracking watch with heart rate monitoring, GPS, sleep tracking, and 7-day battery life. Water-resistant design perfect for all activities.",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
  },
  {
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80a1",
    title: "Professional Coffee Grinder",
    price: 89.99,
    count: 18,
    description:
      "Precision burr coffee grinder with 15 grind settings. Perfect for espresso, pour-over, and French press. Durable stainless steel construction.",
    image: "https://images.unsplash.com/photo-1551006917-3b4c078c47c9?w=400",
  },
  {
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80a3",
    title: "Ergonomic Office Chair",
    price: 449.99,
    count: 8,
    description:
      "Professional ergonomic office chair with lumbar support, adjustable height, and breathable mesh fabric. Designed for long work sessions and maximum comfort.",
    image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400",
  },
  {
    id: "7567ec4b-b10c-48c5-9345-fc73348a80a1",
    title: "Portable Power Bank 20000mAh",
    price: 39.99,
    count: 30,
    description:
      "High-capacity portable power bank with fast charging technology. Compatible with all smartphones and tablets. Includes LED display showing remaining power.",
    image: "https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=400",
  },
  {
    id: "7567ec4b-b10c-48c5-9445-fc73c48a80a2",
    title: "Artisan Ceramic Coffee Mug Set",
    price: 34.99,
    count: 22,
    description:
      "Handcrafted ceramic coffee mug set of 4. Each mug features unique glazed finish and comfortable handle. Microwave and dishwasher safe.",
    image: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400",
  },
  {
    id: "7567ec4b-b10c-48c5-9345-fc73c48a80a7",
    title: "LED Desk Lamp with Wireless Charging",
    price: 79.99,
    count: 12,
    description:
      "Modern LED desk lamp with built-in wireless charging pad, adjustable brightness levels, and USB ports. Perfect for home office or study space.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
  },
];
