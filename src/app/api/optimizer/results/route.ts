import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const filePath = path.join(process.cwd(), "public", "optimization_results.json");
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(fileContent);
      return NextResponse.json({ success: true, data });
    } catch {
      return NextResponse.json(
        { success: false, error: "Nenhum resultado de otimização encontrado. Execute o otimizador primeiro." },
        { status: 404 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
