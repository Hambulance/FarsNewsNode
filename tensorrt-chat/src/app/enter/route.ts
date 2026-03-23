import { NextResponse } from "next/server";
import { chatAccessCookieName, createAccessCookieValue, isValidAccessToken } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const accessToken = searchParams.get("access");

  if (!isValidAccessToken(accessToken)) {
    return NextResponse.redirect(`${origin}/warning`);
  }

  const response = NextResponse.redirect(`${origin}/`);
  response.cookies.set({
    name: chatAccessCookieName,
    value: createAccessCookieValue(),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60
  });
  return response;
}
