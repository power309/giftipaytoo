import 'server-only';

/**
 * A rendered, channel-agnostic message ready for an adapter to deliver.
 * `bodyHtml` is only meaningful for HTML-capable channels (email).
 */
export interface RenderedMessage {
  subject?: string;
  bodyText: string;
  bodyHtml?: string;
  to: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  providerId?: string;
}

/**
 * Every delivery channel (email, SMS, ...) implements this. `isConfigured()`
 * must reflect real credential presence — an adapter that reports configured
 * without working credentials, or that fakes a successful send, violates the
 * project's "no fake integrations" rule.
 */
export interface NotificationChannelAdapter {
  readonly key: string;
  isConfigured(): boolean;
  send(msg: RenderedMessage): Promise<SendResult>;
}
