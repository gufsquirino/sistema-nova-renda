# SNR Backend

## Deploy no Vercel

1. Instale Vercel CLI: `npm i -g vercel`
2. Na pasta snr-backend: `vercel`
3. Configure as variáveis de ambiente no painel Vercel:
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   - HOTMART_TOKEN
   - ADMIN_EMAIL
   - ADMIN_PASS
   - PASSWORD_SUFFIX

## SQL — criar tabela no Supabase

Execute no SQL Editor do Supabase:

```sql
create table members (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  active boolean default true,
  joined_at timestamptz default now(),
  source text default 'manual',
  raw_event text,
  created_at timestamptz default now()
);

-- Index para busca por email
create index members_email_idx on members (email);

-- Row Level Security (mantém dados seguros)
alter table members enable row level security;

-- Apenas service_key pode acessar (seu backend)
create policy "service_only" on members
  using (false);
```

## Configurar webhook na Hotmart

1. Painel Hotmart → Ferramentas → Webhooks
2. URL: `https://SEU-PROJETO.vercel.app/api/webhook?token=snr_webhook_2026`
3. Eventos: PURCHASE_COMPLETE, PURCHASE_APPROVED

## Endpoints

- POST /api/auth    → login do hub
- POST /api/webhook → recebe compras da Hotmart
