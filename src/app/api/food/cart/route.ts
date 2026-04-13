import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ZomatoBridge } from "@/lib/zomato";

export async function POST(req: Request) {
  try {
    const { action, restaurant, item, cartId } = await req.json();

    // Get user for ZomatoBridge calls
    const user = await prisma.user.findFirst();
    const userId = user?.id || "anonymous";

    if (action === "PREPARE_CART") {
      // Step 1: Initialize an autonomous cart preparation
      console.log(`AI preparing cart for ${restaurant}...`);
      return NextResponse.json({ 
        status: "Draft",
        restaurant,
        items: [],
        message: "Select items to add to your Zomato cart." 
      });
    }

    if (action === "ADD_ITEM") {
      // Step 2: Add a specific item autonomously
      const result = await ZomatoBridge.addToCart(userId, restaurant, [item]);
      return NextResponse.json({
        success: true,
        itemAdded: item,
        cartRef: result.cartRef
      });
    }

    if (action === "CHECKOUT") {
      // Step 3: Generate the final Zomato checkout link
      return NextResponse.json({
        success: true,
        checkoutUrl: `https://link.zomato.com/pay?cart=${cartId}`
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
