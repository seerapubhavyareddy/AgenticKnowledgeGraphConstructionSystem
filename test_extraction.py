#!/usr/bin/env python3
"""
Test PDF extraction on a single paper.
Use this to verify extraction works before processing all papers.

Usage:
    python test_extraction.py <arxiv_id>
    python test_extraction.py 2308.04079
"""

import sys
import fitz  # PyMuPDF
import json
from pathlib import Path


def extract_and_preview(pdf_path: str, preview_length: int = 2000):
    """
    Extract text from PDF and show preview.
    
    Args:
        pdf_path: Path to PDF file
        preview_length: Number of characters to preview
    """
    print(f"\n📄 Extracting from: {pdf_path}")
    print("=" * 70)
    
    if not Path(pdf_path).exists():
        print(f"❌ File not found: {pdf_path}")
        return False
    
    try:
        # Open PDF
        doc = fitz.open(pdf_path)
        print(f"✅ PDF opened successfully")
        page_count = len(doc)
        print(f"   Pages: {page_count}")
        
        # Extract text from all pages
        full_text = []
        for page_num, page in enumerate(doc, 1):
            text = page.get_text()
            full_text.append(f"\n--- Page {page_num} ---\n")
            full_text.append(text)
        
        doc.close()
        
        # Combine text
        extracted = "".join(full_text)
        
        # Statistics
        char_count = len(extracted)
        word_count = len(extracted.split())
        
        print(f"\n📊 Extraction Statistics:")
        print(f"   Total characters: {char_count:,}")
        print(f"   Total words: {word_count:,}")
        print(f"   Average words/page: {word_count // page_count:,}")
        
        # Preview first part
        print(f"\n📖 Preview (first {preview_length} characters):")
        print("-" * 70)
        print(extracted[:preview_length])
        print("-" * 70)
        
        # Preview last part
        print(f"\n📖 Preview (last {preview_length} characters):")
        print("-" * 70)
        print(extracted[-preview_length:])
        print("-" * 70)
        
        print(f"\n✅ Extraction successful!")
        return True
        
    except Exception as e:
        print(f"❌ Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python test_extraction.py <arxiv_id>")
        print("Example: python test_extraction.py 2308.04079")
        sys.exit(1)
    
    arxiv_id = sys.argv[1]
    
    # Find PDF path
    pdf_path = f"papers/pdfs/{arxiv_id}.pdf"
    
    # Also try to get metadata
    metadata_path = "papers/metadata/papers_metadata.json"
    if Path(metadata_path).exists():
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        # Find this paper's metadata
        paper_meta = next((p for p in metadata if p['arxiv_id'] == arxiv_id), None)
        
        if paper_meta:
            print("\n📋 Paper Metadata:")
            print(f"   ArXiv ID: {paper_meta['arxiv_id']}")
            print(f"   Title: {paper_meta['title']}")
            print(f"   Authors: {', '.join(paper_meta['authors'][:3])}")
            if len(paper_meta['authors']) > 3:
                print(f"            + {len(paper_meta['authors']) - 3} more")
            print(f"   Published: {paper_meta['published'][:10]}")
            
            # Use local_pdf_path if available
            if 'local_pdf_path' in paper_meta:
                pdf_path = paper_meta['local_pdf_path']
    
    # Extract and preview
    success = extract_and_preview(pdf_path)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()