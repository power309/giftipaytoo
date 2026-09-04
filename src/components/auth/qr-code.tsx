'use client';

import * as React from 'react';
import { encodeQrMatrix } from '@/lib/qr';

/**
 * Renders a QR code as inline SVG from our own dependency-free encoder
 * (`@/lib/qr`) — no external QR/canvas library. Used only for the TOTP
 * enrolment `otpauth://` URI; the security page also always shows the raw
 * secret as a copyable fallback alongside this.
 */
export function QrCode({
  value,
  size = 216,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const matrix = React.useMemo(() => {
    try {
      return encodeQrMatrix(value, 'MEDIUM');
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) return null;

  const quiet = 4;
  const dim = matrix.length + quiet * 2;

  let path = '';
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix.length; x++) {
      if (matrix[y][x]) path += `M${x + quiet},${y + quiet}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      role="img"
      aria-label="کد QR فعال‌سازی تأیید دومرحله‌ای"
      className={className}
      style={{ background: '#fff', borderRadius: '0.75rem' }}
    >
      <path d={path} fill="#0b0d14" />
    </svg>
  );
}
