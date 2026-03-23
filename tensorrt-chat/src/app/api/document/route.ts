import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { chatAccessCookieName, isValidAccessToken } from "@/lib/auth";

function detectDocumentType(file: File) {
  const lowerName = file.name.toLowerCase();

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return "docx";
  }

  if (file.type === "application/msword" || lowerName.endsWith(".doc")) {
    return "doc";
  }

  return "unknown";
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const accessCookie = cookieStore.get(chatAccessCookieName)?.value;

  if (!isValidAccessToken(accessCookie)) {
    return NextResponse.json(
      { error: "Unauthorized access. Open this chat tool from the admin panel on the news site." },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }

    const documentType = detectDocumentType(file);
    const buffer = Buffer.from(await file.arrayBuffer());

    let extractedText = "";

    if (documentType === "pdf") {
      const pdfModule = await import("pdf-parse");
      const pdfParse = ("default" in pdfModule ? pdfModule.default : pdfModule) as (
        buffer: Buffer
      ) => Promise<{ text?: string }>;
      const parsed = await pdfParse(buffer);
      extractedText = parsed.text || "";
    } else if (documentType === "docx") {
      const mammoth = await import("mammoth");
      const parsed = await mammoth.extractRawText({ buffer });
      extractedText = parsed.value || "";
    } else if (documentType === "doc") {
      return NextResponse.json(
        { error: "Legacy .doc files are not supported. Please convert the file to .docx or PDF." },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a PDF or DOCX document." },
        { status: 400 }
      );
    }

    const normalizedText = extractedText.replace(/\s+/g, " ").trim();
    if (!normalizedText) {
      return NextResponse.json({ error: "No readable text was extracted from the file." }, { status: 400 });
    }

    return NextResponse.json({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      fileName: file.name,
      mimeType: file.type || documentType,
      extractedText: normalizedText,
      characterCount: normalizedText.length,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process the uploaded document." }, { status: 500 });
  }
}
