import { Turnstile as CfTurnstile } from '@marsidev/react-turnstile';

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export function isTurnstileEnabled(): boolean {
  return Boolean(siteKey?.trim());
}

type Props = {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
};

export default function Turnstile({ onSuccess, onError, onExpire }: Props) {
  if (!isTurnstileEnabled()) return null;

  return (
    <CfTurnstile
      siteKey={siteKey!}
      onSuccess={onSuccess}
      onError={onError}
      onExpire={onExpire}
      options={{ theme: 'light' }}
    />
  );
}
