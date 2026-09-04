'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/ui';

/**
 * Submit button for a `<form action={serverAction}>`. Reads pending state
 * from `useFormStatus`, so it disables and spins automatically for the
 * duration of the action — and therefore can never double-submit.
 */
export function AuthSubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth loading={pending} disabled={pending} {...props}>
      {children}
    </Button>
  );
}
