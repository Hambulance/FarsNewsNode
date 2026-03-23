import { cookies } from "next/headers";
import { ChatApp } from "@/components/ChatApp";
import { WarningContent } from "@/components/WarningContent";
import { chatAccessCookieName, isValidAccessToken } from "@/lib/auth";

export default async function Page() {
  const cookieStore = await cookies();
  const accessCookie = cookieStore.get(chatAccessCookieName)?.value;

  if (!isValidAccessToken(accessCookie)) {
    return <WarningContent />;
  }

  return <ChatApp />;
}
