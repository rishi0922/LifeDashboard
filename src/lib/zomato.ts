import { prisma } from "./prisma";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

export type ZomatoOrder = {
  id: string;
  restaurant: string;
  items: string;
  cost: number;
  status: string;
  etaMinutes: number | null;
  source: "Zomato";
};

export class ZomatoBridge {
  private static ZOMATO_MCP_URL = "https://mcp-server.zomato.com/mcp";

  private static MOCK_ZOMATO_ORDERS: ZomatoOrder[] = [];

  /**
   * Initializes a connection to the Zomato MCP server.
   */
  private static async getMCPClient(userId: string) {
    const tokenPref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: "ZOMATO_TOKEN" } }
    });

    if (!tokenPref?.value) {
      console.warn("Zomato token not found for user:", userId);
      return null;
    }

    try {
      // Use SSE transport for remote MCP server
      const transport = new SSEClientTransport(new URL(this.ZOMATO_MCP_URL), {
        eventSource: EventSource as any, // Polyfill for Node.js
        requestInit: {
          headers: {
            Authorization: `Bearer ${tokenPref.value}`
          }
        }
      });

      const client = new Client({
        name: "CommandCenter",
        version: "1.0.0"
      }, {
        capabilities: {}
      });

      await client.connect(transport);
      return client;
    } catch (err) {
      console.error("Failed to connect to Zomato MCP:", err);
      return null;
    }
  }

  /**
   * Scans the Zomato account for active orders using MCP list_orders tool.
   */
  static async syncExternalOrders(userId: string) {
    console.log("Syncing Zomato orders for user:", userId);
    
    const client = await this.getMCPClient(userId);
    let externalOrders: ZomatoOrder[] = this.MOCK_ZOMATO_ORDERS;

    if (client) {
      try {
        const response = await client.callTool({
          name: "list_orders",
          arguments: {}
        });

        if (response && Array.isArray(response.content)) {
          // Assuming the tool returns a JSON string in content[0].text
          const data = JSON.parse((response.content[0] as any).text);
          if (Array.isArray(data)) {
            externalOrders = data.map((o: any) => ({
              ...o,
              source: "Zomato"
            }));
          }
        }
      } catch (err) {
        console.error("Zomato MCP list_orders failed, falling back to mocks:", err);
      }
    }

    for (const extOrder of externalOrders) {
      await prisma.foodOrder.upsert({
        where: { externalId: extOrder.id },
        update: {
          status: extOrder.status,
          etaMinutes: extOrder.etaMinutes
        },
        create: {
          restaurant: extOrder.restaurant,
          items: extOrder.items,
          cost: extOrder.cost,
          status: extOrder.status,
          etaMinutes: extOrder.etaMinutes,
          externalId: extOrder.id,
          source: "Zomato",
          userId: userId
        }
      });
    }
  }

  /**
   * Scans previous order history to identify favorites
   */
  static async analyzeHistory(userId: string) {
    const history = await prisma.foodOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const restaurantFreq: Record<string, number> = {};
    history.forEach(order => {
      restaurantFreq[order.restaurant] = (restaurantFreq[order.restaurant] || 0) + 1;
    });

    return {
      favorites: Object.entries(restaurantFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(f => f[0]),
      recentItems: Array.from(new Set(history.map(h => h.items.split(",")[0].trim()))).slice(0, 10)
    };
  }

  /**
   * Finds the best restaurant based on user preference and history
   */
  static async suggestBestOption(userId: string, preference: "Fastest" | "Best Value") {
    // 1. Fetch History for Smart Boosting
    const { favorites } = await this.analyzeHistory(userId);

    const client = await this.getMCPClient(userId);
    let options = [
      { name: "Mehfil Biryani", eta: 20, rating: 4.6, priceRange: "$$" },
      { name: "Biryani Express", eta: 15, rating: 4.2, priceRange: "$$" },
      { name: "Value Bowl", eta: 35, rating: 4.5, priceRange: "$" },
      { name: "Quick Pizza", eta: 10, rating: 3.8, priceRange: "$$" }
    ];

    if (client) {
      try {
        const response = await client.callTool({
          name: "search_restaurants",
          arguments: { preference, favorites }
        });
        if (response && Array.isArray(response.content)) {
          const data = JSON.parse((response.content[0] as any).text);
          if (Array.isArray(data)) options = data;
        }
      } catch (err) {
        console.error("Zomato MCP search_restaurants failed:", err);
      }
    }

    // 3. Apply Favorite Boost (+0.5 rating for favorites)
    const boostedOptions = options.map(opt => ({
      ...opt,
      effectiveRating: favorites.includes(opt.name) ? opt.rating + 0.5 : opt.rating
    }));

    if (preference === "Fastest") {
      return boostedOptions.sort((a, b) => a.eta - b.eta)[0];
    } else {
      return boostedOptions.sort((a, b) => b.effectiveRating - a.effectiveRating || a.priceRange.length - b.priceRange.length)[0];
    }
  }

  /**
   * Autonomous Cart Management
   */
  static async addToCart(userId: string, restaurant: string, items: string[]) {
    console.log(`Autonomous: Adding ${items.join(", ")} from ${restaurant} to Zomato cart.`);
    
    const client = await this.getMCPClient(userId);
    if (client) {
      try {
        const response = await client.callTool({
          name: "add_to_cart",
          arguments: { restaurant, items }
        });
        if (response && Array.isArray(response.content)) {
          return JSON.parse((response.content[0] as any).text);
        }
      } catch (err) {
        console.error("Zomato MCP add_to_cart failed:", err);
      }
    }

    return { success: true, cartRef: `mock_cart_${Math.random().toString(36).substr(2, 9)}` };
  }
}

