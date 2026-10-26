import { liveMode } from "@/lib/site";

import { smsCreditTerms } from "../../../shared/commerce-copy";

export const helpQuestions = [
  {
    question: "Do I need to know scripture before I begin?",
    answer:
      "No. Every practice includes a linked scripture reference, a plain-language explanation, a realistic example, and an action to try. Follow the passage link to read the scripture in context.",
  },
  {
    question: "How do I choose between the Bible and the Book of Mormon?",
    answer:
      "Choose Bible, Book of Mormon, or both during setup. The Bible is the default. You can change the choice in your member settings, and each practice always shows its source.",
  },
  {
    question: liveMode
      ? "How do I start receiving email or SMS lessons?"
      : "Will the preview send me emails or text messages?",
    answer: liveMode
      ? "Create a free account and choose your source, topics and schedule. Email lessons need separate consent. SMS also needs a verified Canadian number and prepaid credit. Your account shows current delivery availability; saving a schedule does not override disabled service, consent or credit checks."
      : "No. The signup verification code is a visible demonstration and schedule settings are stored only in this browser. Nothing is sent, charged or scheduled. Live service requires a separately configured account and verified delivery providers.",
  },
  {
    question: "Can I change the time or pause reminders?",
    answer: liveMode
      ? "Open Schedule in your account to choose your time zone, days and delivery times or window. Pause future lessons whenever you need a break. A message already submitted to a provider may still arrive."
      : "Yes. Open Schedule in the member demo to choose your time zone, days, delivery time or window. You can pause or resume the local preference. Nothing is actually scheduled for delivery in preview mode.",
  },
  {
    question: "How do saved practices and reflections work?",
    answer: liveMode
      ? "Signed-in preferences, saved practices and activity are stored on the service so they can be available on another device. Reflections are optional and are saved only when you choose to save them. Avoid sensitive information about yourself or other people. Reflections are not included in lesson messages."
      : "Saved practices, completion history and optional reflections stay in this browser profile. They are not synced to an account. Avoid sensitive information, especially on a shared device, and export anything you want to keep.",
  },
  {
    question: liveMode
      ? "How do I export or delete my account data?"
      : "How do I delete my demo data?",
    answer: liveMode
      ? "Use the account settings to export your data or request account deletion. Some payment, consent, suppression and security records may need to be retained for legal and operational reasons. Contact support about any remaining SMS credit before deletion; account closure is not an automatic refund."
      : "Use the reset option in member settings, or clear this site's data in your browser. It clears locally saved preferences and activity. There is no server account to delete or recover in preview mode.",
  },
  {
    question: "Is SMS available outside Canada?",
    answer:
      "The initial SMS service supports verified Canadian numbers only. A number starting with +1 is not necessarily Canadian. Browsing the public practice library does not require an SMS number.",
  },
  {
    question: "What is free and what is paid?",
    answer: `Accounts and practice emails are free, subject to service limits. SMS is optional prepaid credit, with one-time $10, $25 or $50 CAD top-ups and a launch rate of $${smsCreditTerms.launchRateCad} CAD per segment. Your account shows the current rate. There is no subscription or automatic recharge. Tax treatment and service checks remain pending; purchases are unavailable in preview mode.`,
  },
  {
    question: "Does SMS credit expire, and can I request a refund?",
    answer: `${smsCreditTerms.noExpiry} ${smsCreditTerms.refund} Contact support before closing an account with credit. Reserved credit stays unavailable until its pending activity is resolved; account closure is not an automatic refund.`,
  },
  {
    question: "Why can one lesson use several SMS segments?",
    answer:
      "The reference, meaning, real-life example, action and sender/opt-out details all count toward message length. Encoding also matters. A long lesson can use several billable segments even when your phone displays it as one message. Check the rate and delivery quote in your account before enabling texts.",
  },
  {
    question: "Is this affiliated with a church?",
    answer:
      "No. Jesus in Practice is an independent project and does not claim church or denominational endorsement. Scripture links identify the source, not an affiliation.",
  },
  {
    question: "Does forgiveness mean contacting someone who hurt me?",
    answer:
      "No. Practices should respect your safety and boundaries. You can adapt or skip any suggestion. Reflections are educational, not professional or therapeutic advice.",
  },
  {
    question: "How do I unsubscribe?",
    answer: liveMode
      ? "Use the unsubscribe link in a practice email, reply STOP to a text, or withdraw the relevant channel consent in account settings. No account login is needed for the message unsubscribe tools. Email and SMS choices are separate. A message already submitted may still arrive; contact support if anything continues unexpectedly."
      : "The preview sends nothing. Live practice emails include an unsubscribe link, and SMS supports STOP. A preview preference is not a production consent record. Each live channel requires its own opt-in and opt-out controls.",
  },
] as const;
