export interface CheckoutRequest {
  organizationId: string;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
}
export interface CheckoutSession {
  provider: string;
  reference: string;
  redirectUrl: string;
}
export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(providerReference: string): Promise<void>;
  verifyWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<Record<string, unknown>>;
}

/** Local placeholder. A Stripe or other provider adapter can implement the same boundary later. */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  private unavailable(): never {
    throw new Error("A payment provider has not been configured.");
  }
  async createCheckout(_request: CheckoutRequest): Promise<CheckoutSession> {
    return this.unavailable();
  }
  async cancelSubscription(_providerReference: string): Promise<void> {
    return this.unavailable();
  }
  async verifyWebhook(
    _payload: Buffer,
    _signature: string,
  ): Promise<Record<string, unknown>> {
    return this.unavailable();
  }
}
