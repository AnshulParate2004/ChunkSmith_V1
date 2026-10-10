import { NextResponse } from "next/server";

export async function GET() {
  const languages = {
    english: "eng",
    hindi: "hin",
    spanish: "spa",
    french: "fra",
    german: "deu",
    chinese_simplified: "chi_sim",
    japanese: "jpn",
    arabic: "ara",
  };

  return NextResponse.json({
    success: true,
    count: Object.keys(languages).length,
    languages,
  });
}
