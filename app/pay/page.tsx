import PaddleCheckoutPage from "@/components/PaddleCheckoutPage";

export const dynamic = "force-dynamic";

const SANDBOX_CLIENT_TOKEN = "test_6d4989e1f2f747dd6b4df4d880b";

export default function PaddlePaymentPage() {
  const environment = process.env.PADDLE_ENV === "live" ? "live" : "sandbox";
  const clientToken = environment === "live"
    ? (process.env.PADDLE_CLIENT_TOKEN ?? "")
    : (process.env.PADDLE_CLIENT_TOKEN ?? SANDBOX_CLIENT_TOKEN);
  return <PaddleCheckoutPage clientToken={clientToken} environment={environment} />;
}
