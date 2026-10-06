interface CloudflareEnv {
  DB: D1Database;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: string;
  SESSION_SECRET?: string;
  RECEPTION_ALLOWED_IP?: string;
  INGEST_SECRET?: string;
  SEPAY_WEBHOOK_SECRET?: string;
  SEPAY_API_KEY?: string;
  RESEND_API_KEY?: string;
  PASSWORD_RESET_FROM?: string;
}
