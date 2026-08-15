import PaddleCheckoutPage from "@/components/PaddleCheckoutPage";

export const dynamic = "force-dynamic";

export default function PaddlePaymentPage() {
  const environment = process.env.PADDLE_ENV === "live" ? "live" : "sandbox";
  const clientToken = process.env.PADDLE_CLIENT_TOKEN ?? "";
  return <PaddleCheckoutPage clientToken={clientToken} environment={environment} />;
}
