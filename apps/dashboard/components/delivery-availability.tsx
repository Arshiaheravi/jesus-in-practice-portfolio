"use client";

import { useDemo } from "@/components/demo-provider";
import type { Channel } from "@/lib/demo-model";

export default function DeliveryAvailability({ channel = "both" }: { channel?: Channel }) {
  const { mode, member } = useDemo();
  if (mode !== "live" || !member) return null;
  const emailUnavailable = channel !== "sms" && !member.capabilities?.emailDelivery;
  const smsUnavailable = channel !== "email" && !member.capabilities?.smsDelivery;
  if (!emailUnavailable && !smsUnavailable) return null;
  const label =
    emailUnavailable && smsUnavailable ? "Email and SMS" : emailUnavailable ? "Email" : "SMS";
  return (
    <p className="field-hint" role="status">
      {label} delivery is currently unavailable. Your preferences and consent choices are kept. You
      can still change your schedule or withdraw consent.
    </p>
  );
}
