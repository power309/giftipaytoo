/** Pure classification of an order's server-truth status into the four UI states the result page renders. */
export type OrderResultCategory = 'success' | 'pending' | 'failed' | 'review';

export function classifyOrder(order: {
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  needsReview: boolean;
}): OrderResultCategory {
  if (order.needsReview || order.status === 'UNDER_REVIEW' || order.fulfillmentStatus === 'MANUAL_REVIEW') {
    return 'review';
  }
  const failedStatuses = ['CANCELED', 'EXPIRED', 'FAILED'];
  const failedPaymentStatuses = ['FAILED', 'VERIFICATION_FAILED', 'CANCELED', 'EXPIRED'];
  if (failedStatuses.includes(order.status) || failedPaymentStatuses.includes(order.paymentStatus)) {
    return 'failed';
  }
  const successStatuses = ['COMPLETED', 'PARTIALLY_FULFILLED', 'REFUNDED', 'PARTIALLY_REFUNDED'];
  if (
    successStatuses.includes(order.status) ||
    (order.paymentStatus === 'PAID' && ['FULFILLED', 'PARTIALLY_FULFILLED'].includes(order.fulfillmentStatus))
  ) {
    return 'success';
  }
  return 'pending';
}

export const STATUS_LABEL_FA: Record<string, string> = {
  PENDING: 'در انتظار پرداخت',
  AWAITING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  UNDER_REVIEW: 'در حال بررسی',
  PROCESSING: 'در حال پردازش',
  COMPLETED: 'تکمیل‌شده',
  PARTIALLY_FULFILLED: 'تحویل جزئی',
  CANCELED: 'لغوشده',
  EXPIRED: 'منقضی‌شده',
  REFUNDED: 'بازگشت وجه',
  PARTIALLY_REFUNDED: 'بازگشت جزئی وجه',
  FAILED: 'ناموفق',
  UNFULFILLED: 'در انتظار تحویل',
  RESERVED: 'رزرو کد',
  FULFILLED: 'تحویل‌شده',
  MANUAL_REVIEW: 'بررسی دستی',
  VERIFICATION_FAILED: 'تأیید پرداخت ناموفق',
};
