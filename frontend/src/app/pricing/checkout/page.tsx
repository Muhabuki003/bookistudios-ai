import { type Metadata } from "next";
import { Suspense } from "react";

import { CheckoutScreen } from "@/components/pricing/checkout-screen";

export const metadata: Metadata = {
  title: "Checkout — bookistudios AI",
  description: "Subscribe to a hosted bookistudios AI plan.",
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutScreen />
    </Suspense>
  );
}
