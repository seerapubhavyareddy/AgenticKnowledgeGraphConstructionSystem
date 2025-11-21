#!/usr/bin/env python3
"""
PDF Text Extraction and Database Population Script

This script:
1. Reads paper metadata from papers_metadata.json
2. Extracts full text from each PDF using PyMuPDF
3. Inserts papers into PostgreSQL database with extracted text

Usage:
    python extract_and_populate.py

Requirements:
    - papers/pdfs/*.pdf (your downloaded PDFs)
    - papers/metadata/papers_metadata.json
    - DATABASE_URL in .env file
"""

import os
import json
import fitz  # PyMuPDF
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
from database_utils import DatabaseConnection
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class PDFTextExtractor:
    """Handles PDF text extraction using PyMuPDF."""
    
    @staticmethod
    def extract_text(pdf_path: str) -> Optional[str]:
        """
        Extract all text from a PDF file.
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            Extracted text as string, or None if extraction fails
        """
        try:
            doc = fitz.open(pdf_path)
            full_text = []
            page_count = len(doc)
            
            for page_num, page in enumerate(doc, 1):
                # Extract text from page
                text = page.get_text()
                
                # Add page break markers for context
                full_text.append(f"\n--- Page {page_num} ---\n")
                full_text.append(text)
            
            doc.close()
            
            # Join all text
            extracted = "".join(full_text)
            
            # Basic cleaning
            extracted = extracted.strip()
            
            return extracted if extracted else None
            
        except Exception as e:
            print(f"   ❌ PDF extraction failed: {e}")
            return None
    
    @staticmethod
    def get_extraction_stats(text: str) -> Dict:
        """Get basic statistics about extracted text."""
        if not text:
            return {
                'char_count': 0,
                'word_count': 0,
                'page_markers': 0
            }
        
        return {
            'char_count': len(text),
            'word_count': len(text.split()),
            'page_markers': text.count('--- Page')
        }


def load_metadata(metadata_path: str = "papers/metadata/papers_metadata.json") -> List[Dict]:
    """
    Load paper metadata from JSON file.
    
    Args:
        metadata_path: Path to metadata JSON file
        
    Returns:
        List of paper metadata dictionaries
    """
    if not os.path.exists(metadata_path):
        raise FileNotFoundError(
            f"Metadata file not found: {metadata_path}\n"
            f"Make sure you've run fetch_papers.py first!"
        )
    
    with open(metadata_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def prepare_paper_data(metadata: Dict, full_text: str) -> Dict:
    """
    Prepare paper data for database insertion.
    
    Args:
        metadata: Paper metadata from JSON
        full_text: Extracted text from PDF
        
    Returns:
        Dictionary formatted for database insertion
    """
    # Parse published date
    published_date = metadata.get('published', '')
    if published_date:
        # Format: "2023-08-04T17:59:59Z" -> "2023-08-04"
        published_date = published_date.split('T')[0]
    
    return {
        'arxiv_id': metadata['arxiv_id'],
        'title': metadata['title'],
        'abstract': metadata.get('abstract', ''),
        'authors': metadata.get('authors', []),
        'published_date': published_date or None,
        'pdf_path': metadata.get('local_pdf_path', None),
        'full_text': full_text,
        'is_seminal': metadata.get('is_seminal', False)
    }


def process_papers(db: DatabaseConnection, papers_metadata: List[Dict]) -> Dict:
    """
    Process all papers: extract text and insert into database.
    
    Args:
        db: Database connection
        papers_metadata: List of paper metadata
        
    Returns:
        Statistics dictionary
    """
    stats = {
        'total': len(papers_metadata),
        'successful': 0,
        'failed_pdf': 0,
        'failed_db': 0,
        'skipped': 0
    }
    
    extractor = PDFTextExtractor()
    
    print("\n" + "=" * 80)
    print("📄 Processing Papers: PDF Extraction → Database")
    print("=" * 80)
    
    for i, paper_meta in enumerate(papers_metadata, 1):
        arxiv_id = paper_meta['arxiv_id']
        title = paper_meta['title']
        
        print(f"\n[{i}/{stats['total']}] Processing: {arxiv_id}")
        print(f"   Title: {title[:70]}...")
        
        # Check if paper already exists in database
        existing = db.get_paper_by_arxiv_id(arxiv_id)
        if existing and existing.get('full_text'):
            print(f"   ⏭️  Already in database with text - skipping")
            stats['skipped'] += 1
            continue
        
        # Get PDF path
        pdf_path = paper_meta.get('local_pdf_path')
        if not pdf_path or not os.path.exists(pdf_path):
            print(f"   ❌ PDF not found: {pdf_path}")
            stats['failed_pdf'] += 1
            
            # Still insert metadata without full_text
            try:
                paper_data = prepare_paper_data(paper_meta, "")
                paper_id = db.insert_paper(paper_data)
                print(f"   ✅ Inserted metadata only (ID: {paper_id})")
            except Exception as e:
                print(f"   ❌ Database insertion failed: {e}")
                stats['failed_db'] += 1
            
            continue
        
        # Extract text from PDF
        print(f"   📖 Extracting text from PDF...")
        full_text = extractor.extract_text(pdf_path)
        
        if not full_text:
            print(f"   ❌ Text extraction failed")
            stats['failed_pdf'] += 1
            continue
        
        # Get extraction stats
        text_stats = extractor.get_extraction_stats(full_text)
        print(f"   ✅ Extracted {text_stats['word_count']:,} words "
              f"({text_stats['page_markers']} pages)")
        
        # Prepare data for database
        paper_data = prepare_paper_data(paper_meta, full_text)
        
        # Insert into database
        try:
            paper_id = db.insert_paper(paper_data)
            print(f"   ✅ Inserted into database (ID: {paper_id})")
            stats['successful'] += 1
            
            # Log successful extraction
            db.log_extraction(
                paper_id=paper_id,
                stage='pdf_extraction',
                status='success',
                processing_time=None
            )
            
        except Exception as e:
            print(f"   ❌ Database insertion failed: {e}")
            stats['failed_db'] += 1
    
    return stats


def print_summary(stats: Dict, db: DatabaseConnection):
    """Print processing summary and database statistics."""
    print("\n" + "=" * 80)
    print("📊 Processing Summary")
    print("=" * 80)
    
    print(f"\nTotal papers processed: {stats['total']}")
    print(f"✅ Successfully inserted: {stats['successful']}")
    print(f"⏭️  Already in database: {stats['skipped']}")
    print(f"❌ Failed (PDF extraction): {stats['failed_pdf']}")
    print(f"❌ Failed (DB insertion): {stats['failed_db']}")
    
    success_rate = (stats['successful'] / stats['total'] * 100) if stats['total'] > 0 else 0
    print(f"\n📈 Success rate: {success_rate:.1f}%")
    
    # Print database statistics
    print("\n" + "-" * 80)
    db.print_statistics()


def verify_extraction(db: DatabaseConnection):
    """Verify that papers have text extracted."""
    print("\n" + "=" * 80)
    print("🔍 Verification: Papers with Extracted Text")
    print("=" * 80)
    
    query = """
    SELECT 
        arxiv_id,
        title,
        LENGTH(full_text) as text_length,
        CASE 
            WHEN full_text IS NULL OR full_text = '' THEN '❌ No text'
            WHEN LENGTH(full_text) < 5000 THEN '⚠️  Short'
            ELSE '✅ OK'
        END as status
    FROM papers
    ORDER BY arxiv_id;
    """
    
    results = db.execute_query(query)
    
    for row in results:
        status = row['status']
        arxiv_id = row['arxiv_id']
        title = row['title'][:50]
        text_len = row['text_length'] or 0
        
        print(f"{status} {arxiv_id} | {text_len:>8,} chars | {title}...")
    
    # Summary
    total = len(results)
    with_text = sum(1 for r in results if r['text_length'] and r['text_length'] > 0)
    
    print(f"\n📊 {with_text}/{total} papers have extracted text")


def main():
    """Main execution function."""
    print("=" * 80)
    print("🚀 PDF Text Extraction and Database Population")
    print("=" * 80)
    
    # Check if papers directory exists
    if not os.path.exists("papers/pdfs"):
        print("\n❌ Error: papers/pdfs directory not found!")
        print("Make sure you have:")
        print("  1. Run fetch_papers.py to download PDFs")
        print("  2. PDFs are in papers/pdfs/")
        return False
    
    try:
        # Load metadata
        print("\n1️⃣  Loading paper metadata...")
        papers_metadata = load_metadata()
        print(f"   ✅ Loaded metadata for {len(papers_metadata)} papers")
        
        # Connect to database
        print("\n2️⃣  Connecting to database...")
        db = DatabaseConnection()
        
        if not db.test_connection():
            print("   ❌ Database connection failed!")
            return False
        print("   ✅ Database connected")
        
        # Process papers
        print("\n3️⃣  Processing papers...")
        stats = process_papers(db, papers_metadata)
        
        # Print summary
        print_summary(stats, db)
        
        # Verify extraction
        verify_extraction(db)
        
        print("\n" + "=" * 80)
        print("🎉 Processing Complete!")
        print("=" * 80)
        print("\n✅ Your papers are now in the database with extracted text!")
        print("✅ Ready for agentic processing (Entity & Relationship extraction)")
        
        print("\nNext steps:")
        print("  1. Set up TypeScript project for agents")
        print("  2. Build Entity Extraction Agent")
        print("  3. Build Relationship Discovery Agent")
        print("  4. Build Validation Agent")
        
        return True
        
    except FileNotFoundError as e:
        print(f"\n❌ Error: {e}")
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    import sys
    success = main()
    sys.exit(0 if success else 1)