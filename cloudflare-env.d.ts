interface CloudflareEnv {
  DB: D1Database;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: string;
  SESSION_SECRET?: string;
  INGEST_SECRET?: string;
  RESEND_API_KEY?: string;
  PASSWORD_RESET_FROM?: string;
}
