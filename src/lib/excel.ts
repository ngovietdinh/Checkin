// Xuất / nhập Excel (tải thư viện khi cần để app nhẹ)
export interface SheetSpec {
  name: string;
  columns: { header: string; key: string; width?: number; numFmt?: string }[];
  rows: Record<string, unknown>[];
  title?: string;
}

export async function exportXlsx(filename: string, sheets: SheetSpec[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Chấm công";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    let headerRow = 1;
    if (s.title) {
      ws.addRow([s.title]).font = { bold: true, size: 14 };
      ws.addRow([]);
      headerRow = 3;
    }
    ws.columns = s.columns.map((c) => ({ key: c.key, width: c.width ?? 14, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
    const hr = ws.getRow(headerRow);
    s.columns.forEach((c, i) => { hr.getCell(i + 1).value = c.header; });
    hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    hr.alignment = { vertical: "middle", wrapText: true };
    for (const r of s.rows) ws.addRow(s.columns.map((c) => r[c.key] ?? null));
    ws.views = [{ state: "frozen", ySplit: headerRow }];
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".xlsx") ? filename : filename + ".xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Đọc sheet đầu tiên thành mảng object theo dòng tiêu đề */
export async function readXlsx(file: File): Promise<Record<string, string>[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => { headers[col] = String(cell.text ?? "").trim(); });
  const out: Record<string, string>[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const obj: Record<string, string> = {};
    let any = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = headers[col];
      if (!h) return;
      const v = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : String(cell.text ?? "").trim();
      obj[h] = v;
      if (v) any = true;
    });
    if (any) out.push(obj);
  });
  return out;
}
