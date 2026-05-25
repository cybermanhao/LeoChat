#!/usr/bin/env python3
"""Extract plain text from a docx file. Usage: python _extract-docx.py <path>"""
import sys, zipfile, io, xml.etree.ElementTree as ET
# Force UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

path = sys.argv[1]
with open(path, 'rb') as f:
    data = f.read()

z = zipfile.ZipFile(io.BytesIO(data))
xml_content = z.read('word/document.xml').decode('utf-8')
NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
root = ET.fromstring(xml_content)

lines = []
for para in root.iter(f'{{{NS}}}p'):
    parts = []
    for t in para.iter(f'{{{NS}}}t'):
        if t.text:
            parts.append(t.text)
    if parts:
        lines.append(''.join(parts))

print('\n'.join(lines))
