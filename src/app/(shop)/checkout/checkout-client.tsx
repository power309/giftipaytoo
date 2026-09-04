'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, ShoppingBag, LogIn } from 'lucide-react';
import Link from 'next/link';
import { Alert, Button, Checkbox, EmptyState, useToast } from '@/components/ui';
import { CHECKOUT_STEPS, StepIndicator, type CheckoutStepKey } from '@/components/checkout/step-indicator';
import { ContactStep, type CheckoutContactMode, type UserContact } from '@/components/checkout/contact-step';
import { PaymentMethodSelector } from '@/components/checkout/payment-method-selector';
import { OrderSummary } from '@/components/checkout/order-summary';
import { RegionAckSummary } from '@/components/checkout/region-ack-summary';
import { ReviewLines } from '@/components/checkout/review-lines';
import type { CartDTO, GatewayDTO, SubmitOrderInput, SubmitOrderResult } from '@/app/(shop)/_lib/types';

const SIMPLE_EMAIL_RE = /^\S+@\S+\.\S+$/;
const SIMPLE_MOBILE_RE = /^(0|\+98|0098)?9\d{9}$/;

/**
 * Wallet application is a checkout-only, client-side toggle — `@/server/cart`'s
 * `getCart()` never applies it (only `createOrderFromCart` does, using the
 * live session), so there's no server round trip for the toggle itself; the
 * server recomputes the real payable amount from scratch at submission and
 * that is what actually gets charged.
 */
function withWalletApplied(cart: CartDTO, useWallet: boolean): CartDTO {
  const base = cart.totals;
  const walletAppliedToman = useWallet ? Math.min(base.walletBalanceToman, base.totalToman) : 0;
  return {
    ...cart,
    totals: {
      ...base,
      walletApplied: useWallet,
      walletAppliedToman,
      payableToman: base.totalToman - walletAppliedToman,
    },
  };
}

export function CheckoutClient({
  initialCart,
  cartUnavailable,
  cartErrorFa,
  gateways,
  gatewaysUnavailable,
  guestCheckoutEnabled,
  walletCheckoutEnabled,
  isSignedIn,
  userContact,
  submitOrder,
}: {
  initialCart: CartDTO;
  cartUnavailable: boolean;
  cartErrorFa: string | null;
  gateways: GatewayDTO[];
  gatewaysUnavailable: boolean;
  guestCheckoutEnabled: boolean;
  walletCheckoutEnabled: boolean;
  isSignedIn: boolean;
  userContact: UserContact;
  submitOrder: (input: SubmitOrderInput) => Promise<SubmitOrderResult>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [step, setStepState] = React.useState<CheckoutStepKey>(() => {
    const s = searchParams.get('step');
    return CHECKOUT_STEPS.some((x) => x.key === s) ? (s as CheckoutStepKey) : 'info';
  });
  const [maxReached, setMaxReached] = React.useState<CheckoutStepKey>(step);

  const setStep = React.useCallback(
    (next: CheckoutStepKey) => {
      setStepState(next);
      const idxNext = CHECKOUT_STEPS.findIndex((s) => s.key === next);
      const idxMax = CHECKOUT_STEPS.findIndex((s) => s.key === maxReached);
      if (idxNext > idxMax) setMaxReached(next);
      router.replace(`${pathname}?step=${next}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [router, pathname, maxReached],
  );

  const [contactMode, setContactMode] = React.useState<CheckoutContactMode>('account');
  const [guestEmail, setGuestEmail] = React.useState('');
  const [guestMobile, setGuestMobile] = React.useState('');
  const [contactError, setContactError] = React.useState<string | null>(null);
  const isGuest = !isSignedIn && contactMode === 'guest';

  const [useWallet, setUseWallet] = React.useState(false);
  const [gatewayKey, setGatewayKey] = React.useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [regionAckAll, setRegionAckAll] = React.useState(false);

  type SubmitFailure = Exclude<SubmitOrderResult, { ok: true }>;
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<SubmitFailure | null>(null);

  React.useEffect(() => {
    if (gateways.length === 1) setGatewayKey(gateways[0].key);
  }, [gateways]);

  // Wallet only ever applies to a signed-in account (see `createOrderFromCart`).
  React.useEffect(() => {
    if (isGuest && useWallet) setUseWallet(false);
  }, [isGuest, useWallet]);

  const cart = withWalletApplied(initialCart, useWallet && !isGuest && walletCheckoutEnabled);
  const hasBlockingIssues = initialCart.blockingIssues.length > 0;
  const regionRestrictedLines = cart.lines.filter((l) => l.requiresRegionAck);
  const needsRegionAck = regionRestrictedLines.length > 0;

  if (cartUnavailable && initialCart.lines.length === 0) {
    return (
      <Alert tone="warn" title="سبد خرید در دسترس نیست">
        {cartErrorFa ?? 'سرویس سبد خرید موقتاً در دسترس نیست.'}
      </Alert>
    );
  }

  if (initialCart.lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="size-8" aria-hidden />}
        title="سبد خرید شما خالی است"
        description="برای ادامه فرآیند خرید، ابتدا کالایی به سبد خرید اضافه کنید."
        action={
          <Link href="/">
            <Button>مشاهده فروشگاه</Button>
          </Link>
        }
      />
    );
  }

  function canGoToPayment(): boolean {
    if (contactMode === 'account') return isSignedIn;
    const emailOk = guestEmail.trim() !== '' && SIMPLE_EMAIL_RE.test(guestEmail.trim());
    const mobileOk = guestMobile.trim() !== '' && SIMPLE_MOBILE_RE.test(guestMobile.trim());
    return emailOk || mobileOk;
  }

  function goToPayment() {
    if (contactMode === 'account' && !isSignedIn) {
      setContactError('برای ادامه، ابتدا وارد حساب کاربری خود شوید.');
      return;
    }
    if (contactMode === 'guest' && !canGoToPayment()) {
      setContactError('ایمیل یا شماره موبایل معتبر وارد کنید.');
      return;
    }
    setContactError(null);
    setStep('payment');
  }

  function goToReview() {
    if (!gatewayKey) return;
    setStep('review');
  }

  const canSubmit =
    !!gatewayKey && termsAccepted && (!needsRegionAck || regionAckAll) && !hasBlockingIssues && !submitting;

  async function doSubmit() {
    if (!gatewayKey) return;
    setSubmitting(true);
    setSubmitError(null);

    const input: SubmitOrderInput = {
      termsAccepted: true,
      regionAcknowledged: regionAckAll,
      useWallet: useWallet && !isGuest && walletCheckoutEnabled,
      gatewayKey: gatewayKey as SubmitOrderInput['gatewayKey'],
      ...(contactMode === 'guest' ? { guestContact: { email: guestEmail.trim() || undefined, mobile: guestMobile.trim() || undefined } } : {}),
    };

    try {
      const result = await submitOrder(input);
      if (!result.ok) {
        setSubmitError(result);
        if (result.code === 'OUT_OF_STOCK') toast.push({ tone: 'danger', message: result.messageFa });
        return;
      }
      if ('paidByWallet' in result) {
        router.push(`/checkout/result/${result.orderNumber}`);
        return;
      }
      window.location.href = result.redirectUrl;
    } catch {
      setSubmitError({ ok: false, code: 'REJECTED', messageFa: 'خطایی غیرمنتظره رخ داد. دوباره تلاش کنید.' });
    } finally {
      setSubmitting(false);
    }
  }

  const completed = CHECKOUT_STEPS.slice(0, CHECKOUT_STEPS.findIndex((s) => s.key === step)).map((s) => s.key);

  return (
    <div className="space-y-6">
      <StepIndicator current={step} completed={completed} className="justify-center lg:hidden" />

      {hasBlockingIssues && (
        <Alert tone="danger" title="سبد خرید شما نیاز به بررسی دارد">
          <div className="space-y-1">
            {initialCart.blockingIssues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
          </div>
          <Link href="/cart" className="mt-2 inline-block font-semibold underline underline-offset-4">
            بازگشت به سبد خرید
          </Link>
        </Alert>
      )}

      <div className="card hidden p-2 lg:block">
        <StepIndicator current={step} completed={completed} className="justify-center py-2" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="card space-y-5 p-5 lg:order-1">
          {step === 'info' && (
            <>
              <h2 className="text-base font-bold text-fg">اطلاعات تماس و تحویل</h2>
              <ContactStep
                isSignedIn={isSignedIn}
                guestCheckoutEnabled={guestCheckoutEnabled}
                userContact={userContact}
                mode={contactMode}
                onModeChange={setContactMode}
                guestEmail={guestEmail}
                guestMobile={guestMobile}
                onGuestEmailChange={setGuestEmail}
                onGuestMobileChange={setGuestMobile}
                fieldError={contactError}
              />
              <div className="flex justify-end pt-2">
                <Button onClick={goToPayment} disabled={hasBlockingIssues}>
                  مرحله بعد
                  <ArrowLeft className="size-4" aria-hidden />
                </Button>
              </div>
            </>
          )}

          {step === 'payment' && (
            <>
              <h2 className="text-base font-bold text-fg">روش پرداخت</h2>
              {isGuest && (
                <Alert tone="warn">
                  در حال حاضر تکمیل پرداخت آنلاین برای خرید مهمان در دسترس نیست. سفارش شما ثبت می‌شود، اما برای
                  پرداخت آن باید وارد حساب کاربری خود شوید یا ثبت‌نام کنید.
                </Alert>
              )}
              <PaymentMethodSelector
                gateways={gateways}
                unavailable={gatewaysUnavailable}
                selected={gatewayKey}
                onSelect={setGatewayKey}
              />
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep('info')}>
                  <ArrowRight className="size-4" aria-hidden />
                  مرحله قبل
                </Button>
                <Button onClick={goToReview} disabled={!gatewayKey}>
                  مرحله بعد
                  <ArrowLeft className="size-4" aria-hidden />
                </Button>
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <h2 className="text-base font-bold text-fg">بازبینی و تأیید نهایی</h2>
              <ReviewLines lines={cart.lines} />

              <RegionAckSummary lines={cart.lines} checked={regionAckAll} onChange={setRegionAckAll} />

              <Checkbox
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                label={
                  <span>
                    <Link href="/p/terms" target="_blank" className="text-primary underline underline-offset-4">
                      قوانین و مقررات
                    </Link>{' '}
                    و{' '}
                    <Link href="/p/refund-policy" target="_blank" className="text-primary underline underline-offset-4">
                      رویه بازگشت وجه
                    </Link>{' '}
                    را مطالعه کرده و می‌پذیرم.
                  </span>
                }
              />

              {submitError && (
                <Alert tone="danger" title="ثبت سفارش ناموفق بود">
                  {submitError.messageFa}
                  {submitError.code === 'OUT_OF_STOCK' && submitError.lines.length ? (
                    <ul className="mt-1.5 list-inside list-disc">
                      {submitError.lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  ) : null}
                  {submitError.code === 'GUEST_PAYMENT_UNSUPPORTED' && (
                    <div className="mt-2">
                      <Link href={`/auth/login?next=${encodeURIComponent(`/checkout/result/${submitError.orderNumber}`)}`}>
                        <Button size="sm" variant="secondary">
                          <LogIn className="size-4" aria-hidden />
                          ورود / ثبت‌نام
                        </Button>
                      </Link>
                    </div>
                  )}
                </Alert>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep('payment')} disabled={submitting}>
                  <ArrowRight className="size-4" aria-hidden />
                  مرحله قبل
                </Button>
                <Button onClick={() => void doSubmit()} disabled={!canSubmit} loading={submitting}>
                  پرداخت و ثبت سفارش
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:order-2">
          <OrderSummary
            totals={cart.totals}
            coupon={cart.coupon}
            quoteExpiresAt={cart.quoteExpiresAt}
            isStale={cart.isStale}
            walletEligible={walletCheckoutEnabled && !isGuest && cart.totals.walletBalanceToman > 0}
            onToggleWallet={setUseWallet}
          />
        </div>
      </div>
    </div>
  );
}
