# Horizon — Online Banking App

A full-stack online banking platform built with **Next.js 15**, **Appwrite**, **Plaid**, and **Dwolla**. Users can sign up, securely link real bank accounts, view balances and transactions, and transfer funds between accounts.

## Features

- 🔐 **Authentication** — Email/password sign-up and sign-in via Appwrite, with rate limiting on repeated failed attempts
- 🏦 **Bank linking** — Connect real bank accounts through Plaid Link, with a Dwolla customer created for money movement
- 💵 **Dashboard** — View linked accounts, total balances, and recent transactions at a glance
- 📊 **Transaction history** — Paginated, categorized transaction list per account
- 💸 **Funds transfer** — Send money between linked accounts using Dwolla transfers
- 🧾 **My Banks** — Manage and view all connected bank accounts
- 🐛 **Error monitoring** — Sentry integration for client, server, and edge runtimes

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) |
| Auth & Database | [Appwrite](https://appwrite.io) |
| Bank connections | [Plaid](https://plaid.com) |
| Money movement | [Dwolla](https://www.dwolla.com) |
| Forms & validation | React Hook Form + Zod |
| Charts | Chart.js / react-chartjs-2 |
| Monitoring | Sentry |

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```env
# NEXT
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# APPWRITE
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT=
APPWRITE_DATABASE_ID=
APPWRITE_USER_COLLECTION_ID=
APPWRITE_ITEM_COLLECTION_ID=
APPWRITE_BANK_COLLECTION_ID=
APPWRITE_TRANSACTION_COLLECTION_ID=
NEXT_APPWRITE_KEY=

# PLAID
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=
PLAID_PRODUCTS=
PLAID_COUNTRY_CODES=

# DWOLLA
DWOLLA_KEY=
DWOLLA_SECRET=
DWOLLA_BASE_URL=
DWOLLA_ENV=
```

`.env.sentry-build-plugin` (separate file, already gitignored):

```env
SENTRY_AUTH_TOKEN=
```

- **Appwrite**: create a project and database with `user`, `item`/`bank`, and `transaction` collections; generate an API key for `NEXT_APPWRITE_KEY`.
- **Plaid**: use `sandbox` credentials from the [Plaid Dashboard](https://dashboard.plaid.com) for local development; test bank logins use Plaid's sandbox credentials (e.g. `user_good` / `pass_good`).
- **Dwolla**: use a [sandbox account](https://accounts-sandbox.dwolla.com) for local development. Note that Dwolla's sandbox is US-only — customers require a real, valid 5-digit ZIP code and a 2-letter state code, or account creation will fail with a `ValidationError`.
- **Sentry**: the only required credential is `SENTRY_AUTH_TOKEN` (Settings → Auth Tokens, needs `project:releases` scope), used at build time to upload source maps. It belongs in `.env.sentry-build-plugin`, not `.env`. The DSN and org/project slug aren't secrets, but make sure they point to your own Sentry project rather than a leftover from a tutorial/template.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
app/
  (auth)/            # Sign-in / sign-up routes and layout
  (root)/             # Authenticated app: dashboard, my-banks, transaction-history, payment-transfer
  api/                # API routes (e.g. Sentry example)
components/
  AuthForm.tsx        # Sign-in/sign-up form with Zod validation
  CustomInput.tsx     # Reusable form field (label, input, optional helper description, error message)
  PlaidLink.tsx       # Plaid Link button + bank-linking flow, with loading state during token exchange
  ui/                 # shadcn/ui primitives
lib/
  actions/            # Server actions (user.actions.ts, dwolla.actions.ts, bank.actions.ts, transaction.actions.ts, etc.)
  appwrite.ts         # Appwrite client setup
  plaid.ts            # Plaid client setup
  rate-limit.ts       # Simple in-memory rate limiting for sign-in attempts
  utils.ts            # Shared helpers + authFormSchema (Zod validation for auth forms)
types/                # Shared TypeScript types
constants/            # App-wide constants (sidebar links, categories, etc.)
```

## Key Flows

**Sign-up**
1. Check whether the email is already registered with Dwolla (Dwolla customers can only be suspended, never deleted, so a previously-used email is permanently blocked).
2. Create the Appwrite auth account.
3. Create a Dwolla customer using the submitted personal/address details.
4. Save the user document in Appwrite (Dwolla customer ID/URL included).
5. If any step after account creation fails, the Appwrite account is rolled back so the email isn't left in a stuck, half-created state.

**Bank linking**
1. Request a Plaid Link token for the signed-up user.
2. Open Plaid Link; on success, exchange the public token for an access token and create a Dwolla funding source.
3. Redirect to the dashboard once linking completes.

## Known Gotchas

- **Dwolla postal codes**: must be a real 5-digit US ZIP (optionally ZIP+4, e.g. `10001-1234`). This is enforced client-side via the `postalCode` regex in `authFormSchema` (`lib/utils.ts`).
- **Dwolla state codes**: must be a valid 2-letter US state abbreviation (e.g. `NY`), also enforced client-side.
- **Sandbox emails**: once a Dwolla sandbox customer is created (even if later abandoned), that email can't be reused — sign-up checks for this up front via `checkDwollaCustomerEmailExists`.
- **Sentry credentials**: only `SENTRY_AUTH_TOKEN` (in `.env.sentry-build-plugin`) needs to be a real secret you generate yourself. The DSN and org/project slug are public-safe identifiers, but if you're starting from a cloned template, double check they point to your own Sentry project and not the original author's.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Appwrite Documentation](https://appwrite.io/docs)
- [Plaid Documentation](https://plaid.com/docs)
- [Dwolla API Documentation](https://developers.dwolla.com)

## Deploy on Vercel

The easiest way to deploy this app is via the [Vercel Platform](https://vercel.com/new). Make sure all environment variables above are configured in your Vercel project settings, and that `DWOLLA_ENV`/`PLAID_ENV` are switched to `production` when you're ready to go live.
