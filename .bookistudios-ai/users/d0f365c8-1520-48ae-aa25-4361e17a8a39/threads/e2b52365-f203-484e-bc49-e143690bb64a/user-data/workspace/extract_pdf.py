import subprocess
import sys

modules = [
    'PyPDF2', 'pypdf', 'pdfminer', 'pdfplumber', 
    'pymupdf', 'fitz', 'pdfminer.high_level',
    'pdfminer3', 'pdfminer.high_level',
    'pikepdf', 'pdf2image', 'pdf2txt', 'pdfminer-six'
]

for mod in modules:
    import_name = mod.split('.')[0]
    try:
        r = subprocess.run([sys.executable, '-c', f'import {import_name}'], capture_output=True, text=True, timeout=5)
        if r.returncode == 0:
            print(f"✓ {mod} is available")
        else:
            print(f"✗ {mod} not available ({r.stderr.strip()[:50]})")
    except:
        print(f"✗ {mod} failed")
