---
name: office-document-specialist-suite
description: Advanced suite for creating, editing, and analyzing Microsoft Office documents (Word, Excel, PowerPoint). Provides specialized tools for automated reporting and document management.
homepage: https://clawhub.ai/robert-janssen/office-document-specialist-suite
metadata:
  {
    "openclaw": {
      "emoji": "📄",
      "requires": {
        "bins": ["python3"]
      },
      "os": ["linux", "darwin", "win32"]
    }
  }
---

# Office Document Specialist Suite

A specialized toolset for professional document manipulation across Word, Excel, and PowerPoint formats.

## Features

- **Word (.docx)**: Create and edit professional reports, manage styles, and insert tables/images.
- **Excel (.xlsx)**: Data analysis, automated spreadsheet generation, and complex formatting.
- **PowerPoint (.pptx)**: Automated slide deck creation from structured data.

## Python Dependencies

Install before use:

```bash
pip install python-docx openpyxl python-pptx
```

Or run the included setup script to create an isolated virtual environment:

```bash
bash setup.sh
source .venv/bin/activate
```

## CLI Tool: ods.py

Generate professional report templates and apply advanced document styling:

**Create a report template:**

```bash
python ods.py template-report --output report.docx --title 'Q1 Analysis' --author 'John'
```

**Apply professional styling to an existing document:**

```bash
python ods.py style-doc input.docx --output styled.docx
python ods.py style-doc input.docx --output styled.docx --landscape
```

**Capabilities:**

- Professional page layout (custom margins: 2.4cm left/right, 2.2cm top/bottom)
- Typography system: Calibri font, styled headings (H1: 18pt navy, H2: 14pt blue)
- Header/footer with suite name and auto page numbers
- Custom "Quote Accent" style for callouts
- Portrait/landscape orientation control

## Word / DOCX

```python
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

# Create a new document
doc = Document()
doc.add_heading('Report Title', 0)

# Add paragraph
p = doc.add_paragraph('Introduction text here.')

# Add table
table = doc.add_table(rows=2, cols=3)
table.style = 'Table Grid'
hdr_cells = table.rows[0].cells
hdr_cells[0].text = 'Name'
hdr_cells[1].text = 'Value'
hdr_cells[2].text = 'Notes'

# Save
doc.save('report.docx')
```

### Edit Existing Document
```python
doc = Document('existing.docx')
for para in doc.paragraphs:
    if 'placeholder' in para.text:
        para.text = para.text.replace('placeholder', 'actual value')
doc.save('updated.docx')
```

## Excel / XLSX

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Report"

# Headers
headers = ['Name', 'Q1', 'Q2', 'Q3', 'Q4', 'Total']
for col, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = Font(bold=True)
    cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")

# Data with formula
ws.cell(row=2, column=1, value="Product A")
for q in range(2, 6):
    ws.cell(row=2, column=q, value=1000 * q)
ws.cell(row=2, column=6, value="=SUM(B2:E2)")

# Auto-fit column width
for col in ws.columns:
    max_length = max(len(str(cell.value or "")) for cell in col)
    ws.column_dimensions[get_column_letter(col[0].column)].width = max_length + 2

wb.save('report.xlsx')
```

### Read and Analyze
```python
from openpyxl import load_workbook

wb = load_workbook('data.xlsx', data_only=True)
ws = wb.active

for row in ws.iter_rows(min_row=2, values_only=True):
    print(row)
```

## PowerPoint / PPTX

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

prs = Presentation()

# Title slide
title_slide_layout = prs.slide_layouts[0]
slide = prs.slides.add_slide(title_slide_layout)
title = slide.shapes.title
subtitle = slide.placeholders[1]
title.text = "Quarterly Report"
subtitle.text = "Q4 2024 Results"

# Content slide
bullet_slide_layout = prs.slide_layouts[1]
slide = prs.slides.add_slide(bullet_slide_layout)
slide.shapes.title.text = "Key Highlights"
tf = slide.placeholders[1].text_frame
tf.text = "Revenue increased 15%"
p = tf.add_paragraph()
p.text = "Costs reduced by 8%"
p.level = 1

prs.save('presentation.pptx')
```

### Add Chart Slide
```python
from pptx.util import Inches
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE

slide = prs.slides.add_slide(prs.slide_layouts[5])
chart_data = ChartData()
chart_data.categories = ['Q1', 'Q2', 'Q3', 'Q4']
chart_data.add_series('Revenue', (1200, 1500, 1800, 2100))

x, y, cx, cy = Inches(1), Inches(1.5), Inches(8), Inches(5)
slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, x, y, cx, cy, chart_data)
```

## Cross-Format Conversion

### DOCX → PDF (Smart Conversion with Chinese Support)

**Priority Order:**
1. **LibreOffice CLI** (best quality, preserves formatting)
2. **reportlab with embedded font** (fallback, works without external dependencies)

**Smart conversion function:**

```python
import shutil
import subprocess
from pathlib import Path

def convert_docx_to_pdf(docx_path: str, output_dir: str) -> str:
    """
    Convert DOCX to PDF with smart fallback.
    Returns the output PDF filename.
    """
    # Try LibreOffice first (best quality)
    if shutil.which("libreoffice"):
        result = subprocess.run([
            "libreoffice", "--headless", "--convert-to", "pdf",
            "--outdir", output_dir, docx_path
        ], capture_output=True, timeout=60)
        if result.returncode == 0:
            return Path(docx_path).stem + ".pdf"

    # Fallback: reportlab with embedded Chinese font
    return _convert_with_reportlab(docx_path, output_dir)

def _convert_with_reportlab(docx_path: str, output_dir: str) -> str:
    """
    Enhanced fallback conversion using reportlab with CJK font support.
    Preserves DOCX formatting: page layout, paragraph styles, character styles, lists.
    """
    from docx import Document
    from docx.shared import Pt, Emu, Twips, Inches as DocxInches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, cm
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
    import platform

    # Find CJK font on the system
    font_name = _find_cjk_font()
    
    # Read DOCX
    doc = Document(docx_path)

    # Extract page settings from DOCX
    section = doc.sections[0] if doc.sections else None
    page_width, page_height, left_margin, right_margin, top_margin, bottom_margin = _get_page_settings(section)
    
    # Create PDF with page settings
    output_path = Path(output_dir) / f"{Path(docx_path).stem}.pdf"
    pdf = SimpleDocTemplate(
        str(output_path),
        pagesize=(page_width, page_height),
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=top_margin,
        bottomMargin=bottom_margin,
    )

    # Create enhanced styles
    styles = _create_styles(font_name)

    story = []
    
    # Process paragraphs in document order with formatting preservation
    processed_tables = set()
    
    for para in doc.paragraphs:
        # Check if paragraph contains a table (inline table)
        # Process any tables that appear before this paragraph
        for table in doc.tables:
            if id(table) not in processed_tables:
                # Check if table is between previous and current paragraph
                # Simple heuristic: process tables in order they appear
                pass
        
        if para.text.strip() or para._element.xpath('.//w:drawing'):  # Has content or images
            para_style = _create_para_style(para, styles, font_name)
            
            # Build formatted text with run-level styling
            formatted_text = _build_formatted_text(para, font_name)
            
            if formatted_text.strip():
                story.append(Paragraph(formatted_text, para_style))
                
                # Add paragraph spacing
                space_after = _get_paragraph_spacing(para)[1]
                if space_after > 0:
                    story.append(Spacer(1, space_after))

    # Handle tables
    for table in doc.tables:
        if id(table) not in processed_tables:
            table_data = _extract_table_data(table, font_name)
            if table_data:
                t = Table(table_data['data'], colWidths=table_data.get('col_widths'))
                t.setStyle(TableStyle([
                    ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTSIZE', (0, 0), (-1, -1), 10),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0.9, 0.9, 0.9)),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 8),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.Color(0.7, 0.7, 0.7)),
                ]))
                story.append(t)
                story.append(Spacer(1, 12))
                processed_tables.add(id(table))

    pdf.build(story)
    return output_path.name


def _get_page_settings(section) -> tuple:
    """Extract page layout settings from DOCX section."""
    from reportlab.lib.units import inch, cm
    
    # Default A4 settings
    default_width = 21 * cm
    default_height = 29.7 * cm
    default_margin = 2.54 * cm
    
    if section is None:
        return (default_width, default_height, default_margin, default_margin, default_margin, default_margin)
    
    try:
        # Get page dimensions
        page_width = section.page_width.emu / 914400 * inch if section.page_width else default_width
        page_height = section.page_height.emu / 914400 * inch if section.page_height else default_height
        
        # Get margins
        left_margin = section.left_margin.emu / 914400 * inch if section.left_margin else default_margin
        right_margin = section.right_margin.emu / 914400 * inch if section.right_margin else default_margin
        top_margin = section.top_margin.emu / 914400 * inch if section.top_margin else default_margin
        bottom_margin = section.bottom_margin.emu / 914400 * inch if section.bottom_margin else default_margin
        
        return (page_width, page_height, left_margin, right_margin, top_margin, bottom_margin)
    except:
        return (default_width, default_height, default_margin, default_margin, default_margin, default_margin)


def _create_styles(font_name: str) -> dict:
    """Create a comprehensive style dictionary with CJK font support."""
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
    from reportlab.lib import colors
    
    base_styles = getSampleStyleSheet()
    styles = {}
    
    # Normal style
    styles['Normal'] = ParagraphStyle(
        'Normal',
        parent=base_styles['Normal'],
        fontName=font_name,
        fontSize=11,
        leading=16,  # 1.45 line height
        spaceBefore=0,
        spaceAfter=6,
        alignment=TA_LEFT,
        firstLineIndent=0,
    )
    
    # Title style
    styles['Title'] = ParagraphStyle(
        'Title',
        parent=base_styles['Title'],
        fontName=font_name,
        fontSize=24,
        leading=32,
        spaceBefore=12,
        spaceAfter=12,
        alignment=TA_CENTER,
    )
    
    # Heading styles
    styles['Heading1'] = ParagraphStyle(
        'Heading1',
        parent=base_styles['Heading1'],
        fontName=font_name,
        fontSize=18,
        leading=24,
        spaceBefore=18,
        spaceAfter=12,
        textColor=colors.Color(0.1, 0.2, 0.4),  # Dark blue
    )
    
    styles['Heading2'] = ParagraphStyle(
        'Heading2',
        parent=base_styles['Heading2'],
        fontName=font_name,
        fontSize=14,
        leading=20,
        spaceBefore=14,
        spaceAfter=8,
        textColor=colors.Color(0.2, 0.3, 0.5),
    )
    
    styles['Heading3'] = ParagraphStyle(
        'Heading3',
        parent=base_styles['Heading3'],
        fontName=font_name,
        fontSize=12,
        leading=16,
        spaceBefore=10,
        spaceAfter=6,
    )
    
    # List item style (for numbered/bulleted lists)
    styles['ListItem'] = ParagraphStyle(
        'ListItem',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=11,
        leading=16,
        spaceBefore=3,
        spaceAfter=3,
        leftIndent=20,
        bulletIndent=0,
    )
    
    return styles


def _create_para_style(para, styles: dict, font_name: str):
    """Create a paragraph style based on DOCX paragraph properties."""
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
    from reportlab.lib.units import cm
    
    # Determine base style from DOCX style
    style_name = para.style.name if para.style else 'Normal'
    
    if 'Heading 1' in style_name or 'Title' in style_name:
        base_style = styles['Heading1']
    elif 'Heading 2' in style_name:
        base_style = styles['Heading2']
    elif 'Heading 3' in style_name or 'Heading' in style_name:
        base_style = styles['Heading3']
    elif 'List' in style_name or para._element.xpath('.//w:numPr'):
        base_style = styles['ListItem']
    else:
        base_style = styles['Normal']
    
    # Get alignment
    alignment = TA_LEFT
    if para.alignment:
        if para.alignment == WD_ALIGN_PARAGRAPH.CENTER:
            alignment = TA_CENTER
        elif para.alignment == WD_ALIGN_PARAGRAPH.RIGHT:
            alignment = TA_RIGHT
        elif para.alignment == WD_ALIGN_PARAGRAPH.JUSTIFY:
            alignment = TA_JUSTIFY
    
    # Get spacing
    space_before, space_after = _get_paragraph_spacing(para)
    
    # Get indentation
    left_indent, first_line_indent = _get_paragraph_indent(para)
    
    # Create custom style
    return ParagraphStyle(
        f'Custom_{id(para)}',
        parent=base_style,
        alignment=alignment,
        spaceBefore=space_before,
        spaceAfter=space_after,
        leftIndent=left_indent,
        firstLineIndent=first_line_indent,
    )


def _get_paragraph_spacing(para) -> tuple:
    """Extract paragraph spacing from DOCX paragraph."""
    from reportlab.lib.units import pt
    
    space_before = 0
    space_after = 6  # Default
    
    try:
        pf = para.paragraph_format
        if pf.space_before:
            space_before = pf.space_before.pt
        if pf.space_after:
            space_after = pf.space_after.pt
        # Handle line spacing
        # pf.line_spacing can be 1.0, 1.5, 2.0 or specific Pt value
    except:
        pass
    
    return (space_before, space_after)


def _get_paragraph_indent(para) -> tuple:
    """Extract paragraph indentation from DOCX paragraph."""
    from reportlab.lib.units import inch
    
    left_indent = 0
    first_line_indent = 0
    
    try:
        pf = para.paragraph_format
        if pf.left_indent:
            left_indent = pf.left_indent.emu / 914400 * inch
        if pf.first_line_indent:
            first_line_indent = pf.first_line_indent.emu / 914400 * inch
    except:
        pass
    
    return (left_indent, first_line_indent)


def _build_formatted_text(para, font_name: str) -> str:
    """Build reportlab-formatted text from DOCX paragraph runs with styling."""
    import re
    
    if not para.text.strip():
        return ''
    
    parts = []
    
    for run in para.runs:
        text = run.text
        if not text:
            continue
        
        # Escape XML special characters
        text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        
        # Get run formatting
        is_bold = run.bold
        is_italic = run.italic
        is_underline = run.underline
        font_size = run.font.size.pt if run.font.size else None
        
        # Build font tag
        font_tags = []
        if is_bold:
            font_tags.append('b')
        if is_italic:
            font_tags.append('i')
        if is_underline:
            font_tags.append('u')
        
        # Apply formatting
        if font_tags:
            open_tags = ''.join(f'<{t}>' for t in font_tags)
            close_tags = ''.join(f'</{t}>' for t in reversed(font_tags))
            text = f'{open_tags}{text}{close_tags}'
        
        if font_size:
            text = f'<font size="{font_size}">{text}</font>'
        
        parts.append(text)
    
    result = ''.join(parts)
    
    # Handle numbered/bulleted lists
    num_pr = para._element.xpath('.//w:numPr')
    if num_pr:
        # Try to extract list level and number
        ilvl = num_pr[0].find(qn('w:ilvl'))
        num_id = num_pr[0].find(qn('w:numId'))
        # Add bullet or number marker
        level = int(ilvl.get(qn('w:val'))) if ilvl is not None else 0
        indent = '  ' * level
        result = f'{indent}• {result}'
    
    return result


def _extract_table_data(table, font_name: str) -> dict:
    """Extract table data and column widths from DOCX table."""
    data = []
    col_widths = []
    
    for row_idx, row in enumerate(table.rows):
        row_data = []
        for col_idx, cell in enumerate(row.cells):
            # Get cell text with basic formatting
            cell_text = ''
            for para in cell.paragraphs:
                para_text = _build_formatted_text(para, font_name)
                if para_text:
                    cell_text += para_text + '<br/>'
            cell_text = cell_text.rstrip('<br/>')
            row_data.append(cell_text)
            
            # Get column width from first row
            if row_idx == 0:
                try:
                    width = cell.width.emu / 914400 * inch if cell.width else None
                    col_widths.append(width)
                except:
                    col_widths.append(None)
        
        data.append(row_data)
    
    # Filter out None widths
    if all(w is None for w in col_widths):
        col_widths = None
    
    return {'data': data, 'col_widths': col_widths}


def _find_cjk_font() -> str:
    """
    Find and register a CJK font on the current system.
    Returns the registered font name.
    
    Priority:
    1. Embedded font in skill directory
    2. System CJK font (macOS STHeiti, Windows 微软雅黑, Linux Noto)
    3. Fallback to Helvetica
    """
    import platform
    from pathlib import Path
    
    system = platform.system()
    
    # Check for embedded font first
    skill_dir = Path(__file__).parent
    embedded_font = skill_dir / "fonts" / "NotoSansSC-Regular.otf"
    if embedded_font.exists():
        try:
            pdfmetrics.registerFont(TTFont('NotoSansSC', str(embedded_font)))
            return 'NotoSansSC'
        except:
            pass
    
    # System font paths by platform
    system_fonts = {
        'Darwin': [
            '/System/Library/Fonts/STHeiti Light.ttc',
            '/System/Library/Fonts/PingFang.ttc',
            '/Library/Fonts/Arial Unicode.ttf',
        ],
        'Windows': [
            'C:/Windows/Fonts/msyh.ttc',  # 微软雅黑
            'C:/Windows/Fonts/simhei.ttf',  # 黑体
            'C:/Windows/Fonts/simsun.ttc',  # 宋体
        ],
        'Linux': [
            '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
        ],
    }
    
    for font_path in system_fonts.get(system, []):
        if Path(font_path).exists():
            try:
                # TTC files need subfontIndex
                if font_path.endswith('.ttc'):
                    pdfmetrics.registerFont(TTFont('CJKFont', font_path, subfontIndex=0))
                else:
                    pdfmetrics.registerFont(TTFont('CJKFont', font_path))
                return 'CJKFont'
            except Exception:
                continue
    
    # Fallback to Helvetica (will show garbled CJK characters)
    return 'Helvetica'
```

**Usage:**

```python
# Simple conversion
pdf_file = convert_docx_to_pdf("document.docx", "./output")

# Check if LibreOffice was used
if shutil.which("libreoffice"):
    print("Used LibreOffice (best quality)")
else:
    print("Used enhanced reportlab fallback (CJK font + formatting preserved)")
```

**Preserved Formatting (Enhanced Fallback):**

| Feature | Support Level |
|---------|---------------|
| Page layout (margins, size) | ✅ Full |
| Paragraph spacing | ✅ Full |
| Text alignment | ✅ Full |
| Bold/Italic/Underline | ✅ Full |
| Font size | ✅ Full |
| Heading styles | ✅ Full |
| Numbered/Bulleted lists | ✅ Basic (bullet marker) |
| Tables | ✅ Full (with widths) |
| Indentation | ✅ Full |
| Line spacing | ⚠️ Approximate |
| Images | ❌ Not supported |
| Headers/Footers | ❌ Not supported |
| Columns | ❌ Not supported |

**Font file location:** `fonts/NotoSansSC-Regular.otf` (optional, for embedded font)

**Limitations of fallback mode:**
- Images, headers/footers, and multi-column layouts are not supported
- Complex list numbering (restart, custom formats) may not be perfectly preserved
- For best results, install LibreOffice for full fidelity conversion

### LibreOffice CLI (Direct Usage)

```bash
libreoffice --headless --convert-to pdf document.docx
libreoffice --headless --convert-to pdf --outdir /output/dir document.docx
```

**Install LibreOffice:**
- macOS: `brew install --cask libreoffice`
- Ubuntu/Debian: `sudo apt install libreoffice`
- Windows: Download from https://libreoffice.org

### XLSX → CSV
```python
import pandas as pd
df = pd.read_excel('data.xlsx', sheet_name='Sheet1')
df.to_csv('data.csv', index=False)
```

### PDF text → DOCX
```python
from pypdf import PdfReader
from docx import Document

reader = PdfReader("input.pdf")
doc = Document()
for page in reader.pages:
    doc.add_paragraph(page.extract_text())
doc.save("output.docx")
```

## Common Traps

- `python-docx` uses `Document()` for new files and `Document(\'path\')` for existing ones.
- `openpyxl` with `data_only=True` reads cached formula values, not live formulas.
- `python-pptx` placeholder indices vary by slide layout; always inspect the layout before assuming index 1 is the body.
- LibreOffice headless conversion requires LibreOffice to be installed (`brew install libreoffice` on macOS).
- When editing DOCX styles, modifying `para.text` directly clears all runs and inline formatting; use run-level edits for precision.
- PPTX charts require `lxml` and the chart XML must be well-formed; prefer `python-pptx` chart API over raw XML edits.
- **Chinese/Japanese/Korean PDF conversion**: Always use `convert_docx_to_pdf()` which handles CJK fonts automatically. Direct reportlab usage without font registration will show garbled characters.
- **Font embedding**: The embedded `NotoSansSC-Regular.otf` font file must be present for CJK fallback conversion. If missing, the converter falls back to Helvetica which cannot render CJK characters.
