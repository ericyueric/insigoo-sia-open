from playwright.sync_api import sync_playwright
import sys, os
from pathlib import Path

def html_to_pdf(html_path, pdf_path=None):
    """将 SIA HTML 报告转为 A4 PDF。
    
    Args:
        html_path: HTML 文件路径
        pdf_path: PDF 输出路径（默认与 HTML 同目录同名）
    """
    if pdf_path is None:
        pdf_path = html_path.rsplit(".", 1)[0] + ".pdf"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto(Path(html_path).as_uri())
        page.wait_for_load_state("networkidle")
        page.pdf(
            path=pdf_path,
            format="A4",
            margin={"top": "10mm", "bottom": "10mm", "left": "0", "right": "0"},
            print_background=True,
            display_header_footer=False
        )
        browser.close()
    
    size_kb = os.path.getsize(pdf_path) / 1024
    print(f"PDF 已生成: {pdf_path} ({size_kb:.0f} KB)")
    return pdf_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sia-to-pdf.py <html_path> [pdf_path]")
        sys.exit(1)
    
    html_path = sys.argv[1]
    pdf_path = sys.argv[2] if len(sys.argv) > 2 else None
    html_to_pdf(html_path, pdf_path)
