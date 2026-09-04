'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Field, Input, Textarea, Select, Alert } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { AttachmentPicker, type UploadedAttachment } from '@/components/account/attachment-picker';
import { createTicketAction, type TicketFormState } from '../actions';

export function NewTicketForm({
  departments,
  orders,
  defaultOrderId,
}: {
  departments: { id: string; nameFa: string }[];
  orders: { id: string; orderNumber: string }[];
  defaultOrderId?: string;
}) {
  const [state, formAction] = useActionState<TicketFormState, FormData>(createTicketAction, { ok: false });
  const [attachments, setAttachments] = React.useState<UploadedAttachment[]>([]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />

      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="موضوع" htmlFor="subject" required>
        <Input id="subject" name="subject" required minLength={3} maxLength={200} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="دپارتمان" htmlFor="departmentId">
          <Select id="departmentId" name="departmentId" defaultValue="">
            <option value="">بدون دپارتمان مشخص</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nameFa}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="اولویت" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="NORMAL">
            <option value="LOW">کم</option>
            <option value="NORMAL">عادی</option>
            <option value="HIGH">بالا</option>
            <option value="URGENT">فوری</option>
          </Select>
        </Field>
      </div>

      {orders.length > 0 && (
        <Field label="سفارش مرتبط (اختیاری)" htmlFor="orderId">
          <Select id="orderId" name="orderId" defaultValue={defaultOrderId ?? ''}>
            <option value="">بدون سفارش مرتبط</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNumber}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="شرح درخواست" htmlFor="bodyFa" required hint="حداقل ۵ کاراکتر">
        <Textarea id="bodyFa" name="bodyFa" required minLength={5} maxLength={4000} rows={6} />
      </Field>

      <AttachmentPicker onChange={setAttachments} />

      <AuthSubmitButton>ارسال تیکت</AuthSubmitButton>
    </form>
  );
}
