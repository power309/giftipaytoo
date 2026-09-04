'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Lock, Send } from 'lucide-react';
import { Button, Select, Textarea, Field, Checkbox, Input, Badge } from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { formatJalali } from '@/lib/persian';
import { cn } from '@/lib/utils';
import { TICKET_PRIORITY_OPTIONS, TICKET_STATUS_OPTIONS } from '../_lib';
import { replyToTicket, assignTicket, updateTicketMeta } from './actions';

type Message = {
  id: string;
  isStaff: boolean;
  bodyFa: string;
  createdAt: Date;
  author: { firstName: string | null; lastName: string | null } | null;
  attachments: unknown;
};
type Pick = { id: string; nameFa: string };
type StaffPick = { id: string; firstName: string | null; lastName: string | null };
type TicketMeta = { id: string; status: string; priority: string; departmentId: string | null; assignedToId: string | null };

function parseAttachments(a: unknown): { internal: boolean; files: { path: string; name: string }[] } {
  if (!a || typeof a !== 'object') return { internal: false, files: [] };
  const obj = a as { internal?: boolean; files?: { path: string; name: string }[] };
  return { internal: !!obj.internal, files: obj.files ?? [] };
}

export function TicketThreadClient({
  ticket, messages, departments, staffList, cannedResponses, perms,
}: {
  ticket: TicketMeta;
  messages: Message[];
  departments: Pick[];
  staffList: StaffPick[];
  cannedResponses: { label: string; body: string }[];
  perms: { canReply: boolean; canAssign: boolean };
}) {
  const router = useRouter();
  const [body, setBody] = React.useState('');
  const [internal, setInternal] = React.useState(false);
  const [attachUrl, setAttachUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [metaBusy, setMetaBusy] = React.useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await replyToTicket({ ticketId: ticket.id, body, internal, attachmentUrl: attachUrl || undefined });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setBody('');
      setAttachUrl('');
      router.refresh();
    }
  }

  async function updateMeta(patch: Partial<{ status: string; priority: string; departmentId: string | null }>) {
    setMetaBusy(true);
    await updateTicketMeta({ ticketId: ticket.id, ...patch } as never);
    setMetaBusy(false);
    router.refresh();
  }

  async function updateAssignee(assignedToId: string | null) {
    setMetaBusy(true);
    await assignTicket({ ticketId: ticket.id, assignedToId });
    setMetaBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {(perms.canReply || perms.canAssign) && (
        <Panel title="مدیریت تیکت">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="وضعیت">
              <Select disabled={!perms.canReply || metaBusy} defaultValue={ticket.status} onChange={(e) => updateMeta({ status: e.target.value })}>
                {TICKET_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="اولویت">
              <Select disabled={!perms.canReply || metaBusy} defaultValue={ticket.priority} onChange={(e) => updateMeta({ priority: e.target.value })}>
                {TICKET_PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="دپارتمان">
              <Select disabled={!perms.canAssign || metaBusy} defaultValue={ticket.departmentId ?? ''} onChange={(e) => updateMeta({ departmentId: e.target.value || null })}>
                <option value="">بدون دپارتمان</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.nameFa}</option>)}
              </Select>
            </Field>
            <Field label="ارجاع به">
              <Select disabled={!perms.canAssign || metaBusy} defaultValue={ticket.assignedToId ?? ''} onChange={(e) => updateAssignee(e.target.value || null)}>
                <option value="">تخصیص‌نیافته</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{[s.firstName, s.lastName].filter(Boolean).join(' ')}</option>)}
              </Select>
            </Field>
          </div>
        </Panel>
      )}

      <Panel title="گفتگو">
        <div className="max-h-[32rem] space-y-3 overflow-y-auto pe-1">
          {messages.length === 0 && <p className="py-4 text-center text-sm text-fg-muted">پیامی ثبت نشده است.</p>}
          {messages.map((m) => {
            const meta = parseAttachments(m.attachments);
            return (
              <div
                key={m.id}
                className={cn(
                  'max-w-[85%] rounded-xl p-3 text-sm',
                  !m.isStaff ? 'me-auto bg-surface-muted' : meta.internal ? 'ms-auto border border-warn/30 bg-warn-soft' : 'ms-auto bg-primary-soft',
                )}
              >
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-medium text-fg">
                    {m.isStaff ? (m.author ? [m.author.firstName, m.author.lastName].filter(Boolean).join(' ') : 'پشتیبانی') : 'مشتری'}
                  </span>
                  {meta.internal && (
                    <Badge tone="warn" size="sm">
                      <Lock className="size-3" aria-hidden />
                      یادداشت داخلی
                    </Badge>
                  )}
                  <span className="text-fg-faint">{formatJalali(m.createdAt, true)}</span>
                </div>
                <p className="whitespace-pre-wrap leading-6 text-fg">{m.bodyFa}</p>
                {meta.files.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {meta.files.map((f, i) => (
                      <li key={i}>
                        <a href={f.path} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <Paperclip className="size-3" aria-hidden />
                          {f.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {perms.canReply && (
          <div className="mt-4 space-y-2 border-t border-border-base pt-3">
            {cannedResponses.length > 0 && (
              <Select
                className="h-9 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const found = cannedResponses.find((c) => c.label === e.target.value);
                  if (found) setBody((b) => (b ? `${b}\n${found.body}` : found.body));
                }}
              >
                <option value="">افزودن پاسخ آماده…</option>
                {cannedResponses.map((c) => (
                  <option key={c.label} value={c.label}>{c.label}</option>
                ))}
              </Select>
            )}
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="پاسخ خود را بنویسید…" />
            <Input value={attachUrl} onChange={(e) => setAttachUrl(e.target.value)} placeholder="آدرس پیوست (اختیاری)" dir="ltr" className="h-9 text-xs" />
            <div className="flex items-center justify-between gap-2">
              <Checkbox checked={internal} onChange={(e) => setInternal(e.target.checked)} label="یادداشت داخلی (فقط کارکنان می‌بینند)" />
              <Button size="sm" loading={busy} disabled={body.trim().length < 1} onClick={send}>
                <Send className="size-4" aria-hidden />
                {internal ? 'ثبت یادداشت' : 'ارسال پاسخ'}
              </Button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        )}
      </Panel>
    </div>
  );
}
