# Supabase authentication email

Use [sign-in-email.html](sign-in-email.html) for both **Confirm sign up** and **Magic link or OTP**, with the subject **Your Jesus in Practice sign-in code**. The application verifies an email and numeric code; it does not implement a magic-link callback. Keep `{{ .Token }}` intact and do not substitute a confirmation link.

The template follows Heritage colours, uses local system fonts, and loads no images, tracking pixels, scripts or external styles. It is an authentication message, separate from recurring practice-email consent. It makes no delivery or expiry claim that depends on provider settings.

Configure and verify custom SMTP before installation. The Supabase dashboard observed on 2026-10-20 requires custom SMTP to edit authentication templates; its default mail service is not suitable for public signup. Use a dedicated Resend sending credential and a verified domain sender, with sender name **Jesus in Practice**. Keep credentials in Supabase's SMTP settings, outside this directory.

Set the Auth Site URL to `https://app.example.com`. This is the intended origin, not evidence that hosting or DNS is live. Do not add wildcard redirect URLs or a callback route the application does not implement. Numeric OTP does not require a browser redirect allowlist.

Before opening signup, verify the rendered email and real code flow for both a new and an existing authorized recipient. Check expired/incorrect codes, resend limits, mobile readability, and session cookies on the deployed HTTPS app. Local HTML inspection is not evidence of inbox rendering or SMTP delivery.

Official guidance: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless).
