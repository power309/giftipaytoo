export type Tone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger' | 'gold';

const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'در انتظار تکمیل', tone: 'neutral' },
  AWAITING_PAYMENT: { label: 'در انتظار پرداخت', tone: 'warn' },
  PAID: { label: 'پرداخت‌شده', tone: 'primary' },
  UNDER_REVIEW: { label: 'در حال بررسی', tone: 'warn' },
  PROCESSING: { label: 'در حال پردازش', tone: 'primary' },
  COMPLETED: { label: 'تکمیل‌شده', tone: 'success' },
  PARTIALLY_FULFILLED: { label: 'تحویل جزئی', tone: 'warn' },
  CANCELED: { label: 'لغوشده', tone: 'neutral' },
  EXPIRED: { label: 'منقضی‌شده', tone: 'neutral' },
  REFUNDED: { label: 'بازپرداخت‌شده', tone: 'danger' },
  PARTIALLY_REFUNDED: { label: 'بازپرداخت جزئی', tone: 'warn' },
  FAILED: { label: 'ناموفق', tone: 'danger' },
};

const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'در انتظار پرداخت', tone: 'warn' },
  PROCESSING: { label: 'در حال بررسی پرداخت', tone: 'warn' },
  PAID: { label: 'پرداخت‌شده', tone: 'success' },
  VERIFICATION_FAILED: { label: 'تأیید ناموفق', tone: 'danger' },
  CANCELED: { label: 'لغوشده', tone: 'neutral' },
  EXPIRED: { label: 'منقضی‌شده', tone: 'neutral' },
  REFUNDED: { label: 'بازپرداخت‌شده', tone: 'danger' },
  PARTIALLY_REFUNDED: { label: 'بازپرداخت جزئی', tone: 'warn' },
  FAILED: { label: 'ناموفق', tone: 'danger' },
};

const FULFILLMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  UNFULFILLED: { label: 'تحویل‌نشده', tone: 'neutral' },
  RESERVED: { label: 'رزروشده', tone: 'warn' },
  PARTIALLY_FULFILLED: { label: 'تحویل جزئی', tone: 'warn' },
  FULFILLED: { label: 'تحویل‌شده', tone: 'success' },
  FAILED: { label: 'ناموفق', tone: 'danger' },
  MANUAL_REVIEW: { label: 'بررسی دستی', tone: 'warn' },
};

const TICKET_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'باز', tone: 'primary' },
  PENDING_CUSTOMER: { label: 'منتظر پاسخ شما', tone: 'warn' },
  PENDING_STAFF: { label: 'منتظر پاسخ پشتیبانی', tone: 'warn' },
  RESOLVED: { label: 'حل‌شده', tone: 'success' },
  CLOSED: { label: 'بسته‌شده', tone: 'neutral' },
};

const TICKET_PRIORITY: Record<string, { label: string; tone: Tone }> = {
  LOW: { label: 'کم', tone: 'neutral' },
  NORMAL: { label: 'عادی', tone: 'primary' },
  HIGH: { label: 'بالا', tone: 'warn' },
  URGENT: { label: 'فوری', tone: 'danger' },
};

const REFUND_STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: 'درخواست‌شده', tone: 'warn' },
  APPROVED: { label: 'تأییدشده', tone: 'primary' },
  REJECTED: { label: 'ردشده', tone: 'danger' },
  PROCESSED: { label: 'انجام‌شده', tone: 'success' },
  FAILED: { label: 'ناموفق', tone: 'danger' },
};

const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'در انتظار بررسی', tone: 'warn' },
  APPROVED: { label: 'تأییدشده', tone: 'success' },
  REJECTED: { label: 'ردشده', tone: 'danger' },
};

function lookup(map: Record<string, { label: string; tone: Tone }>, key: string) {
  return map[key] ?? { label: key, tone: 'neutral' as Tone };
}

export const orderStatusInfo = (s: string) => lookup(ORDER_STATUS, s);
export const paymentStatusInfo = (s: string) => lookup(PAYMENT_STATUS, s);
export const fulfillmentStatusInfo = (s: string) => lookup(FULFILLMENT_STATUS, s);
export const ticketStatusInfo = (s: string) => lookup(TICKET_STATUS, s);
export const ticketPriorityInfo = (s: string) => lookup(TICKET_PRIORITY, s);
export const refundStatusInfo = (s: string) => lookup(REFUND_STATUS, s);
export const reviewStatusInfo = (s: string) => lookup(REVIEW_STATUS, s);
