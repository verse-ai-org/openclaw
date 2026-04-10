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

### DOCX → PDF (via LibreOffice CLI)
```bash
libreoffice --headless --convert-to pdf document.docx
```

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

- `python-docx` uses `Document()` for new files and `Document('path')` for existing ones.
- `openpyxl` with `data_only=True` reads cached formula values, not live formulas.
- `python-pptx` placeholder indices vary by slide layout; always inspect the layout before assuming index 1 is the body.
- LibreOffice headless conversion requires LibreOffice to be installed (`brew install libreoffice` on macOS).
- When editing DOCX styles, modifying `para.text` directly clears all runs and inline formatting; use run-level edits for precision.
- PPTX charts require `lxml` and the chart XML must be well-formed; prefer `python-pptx` chart API over raw XML edits.
