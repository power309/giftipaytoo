/**
 * Types and pure constants shared between the server content layer
 * (`_content.ts`, which touches Prisma) and client components (FAQ search).
 */

export type FaqItem = { id: string; questionFa: string; answerFa: string; group: string };

export const FAQ_GROUP_LABELS: Record<string, string> = {
  general: 'عمومی',
  order: 'سفارش و پرداخت',
  delivery: 'تحویل و کد',
  account: 'حساب کاربری',
  refund: 'بازگشت وجه',
  support: 'پشتیبانی',
};
