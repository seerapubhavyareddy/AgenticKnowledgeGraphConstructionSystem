#!/usr/bin/env python3
"""
Citation-based paper fetcher for Knowledge Graph system.
Uses Semantic Scholar API to get papers that cite the seminal paper (2308.04079).
This ensures all papers have a direct relationship with the seminal work.
"""

import arxiv
import json
import requests
from pathlib import Path
from typing import List, Dict, Optional
import time
from datetime import datetime
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

# Create directories
Path("papers/pdfs").mkdir(parents=True, exist_ok=True)
Path("papers/metadata").mkdir(parents=True, exist_ok=True)

# Semantic Scholar API configuration
SEMANTIC_SCHOLAR_API_BASE = "https://api.semanticscholar.org/graph/v1"
RATE_LIMIT_DELAY = 1.0  # Seconds between API calls (be respectful)

# Create session with retry logic
def create_session():
    """Create requests session with retry logic."""
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def load_existing_papers() -> Dict[str, Dict]:
    """Load existing papers from metadata file to avoid duplicates."""
    metadata_path = Path("papers/metadata/papers_metadata.json")
    
    if metadata_path.exists():
        with open(metadata_path, 'r', encoding='utf-8') as f:
            papers = json.load(f)
            # Return as dict keyed by arxiv_id for fast lookup
            return {paper['arxiv_id']: paper for paper in papers}
    
    return {}


def save_papers_metadata(papers: List[Dict]) -> None:
    """Save papers metadata to JSON file."""
    output_path = Path("papers/metadata/papers_metadata.json")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Saved metadata to: {output_path}")


def create_summary_csv(papers: List[Dict]) -> None:
    """Create a CSV summary of papers for easy viewing."""
    summary_path = Path("papers/metadata/papers_summary.csv")
    
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write("arxiv_id,title,authors,published,has_pdf,search_strategy,cites_seminal\n")
        
        for p in papers:
            title_clean = p['title'].replace(',', ';').replace('\n', ' ')
            authors_str = '; '.join(p.get('authors', [])[:2])
            has_pdf = 'Yes' if p.get('local_pdf_path') else 'No'
            published_date = p.get('published', '')[:10] if p.get('published') else 'Unknown'
            strategy = p.get('search_strategy', 'unknown')
            cites_seminal = 'Yes' if p.get('cites_seminal', False) else 'No'
            
            f.write(f"{p['arxiv_id']},{title_clean},{authors_str},{published_date},{has_pdf},{strategy},{cites_seminal}\n")
    
    print(f"💾 Saved summary to: {summary_path}")


def fetch_seminal_paper(existing_papers: Dict[str, Dict]) -> Dict:
    """Fetch the seminal 3D Gaussian Splatting paper if not already present."""
    
    seminal_id = "2308.04079"
    
    # Check if we already have it
    if seminal_id in existing_papers:
        print(f"\n🌟 Seminal paper already exists: {existing_papers[seminal_id]['title']}")
        return existing_papers[seminal_id]
    
    print("\n🌟 Fetching seminal paper: 3D Gaussian Splatting for Real-Time Radiance Field Rendering")
    print("=" * 80)
    
    client = arxiv.Client()
    search = arxiv.Search(id_list=[seminal_id])
    
    try:
        result = next(client.results(search))
        
        paper_data = {
            "arxiv_id": seminal_id,
            "title": result.title,
            "authors": [author.name for author in result.authors],
            "abstract": result.summary,
            "published": result.published.isoformat(),
            "updated": result.updated.isoformat(),
            "pdf_url": result.pdf_url,
            "categories": result.categories,
            "primary_category": result.primary_category,
            "is_seminal": True,
            "cites_seminal": False,  # This IS the seminal paper
            "search_strategy": "direct_id"
        }
        
        print(f"✅ {paper_data['title']}")
        print(f"   Authors: {', '.join(paper_data['authors'][:3])}{'...' if len(paper_data['authors']) > 3 else ''}")
        print(f"   Published: {result.published.strftime('%Y-%m-%d')}")
        
        # Download PDF
        pdf_path = f"papers/pdfs/{paper_data['arxiv_id']}.pdf"
        try:
            result.download_pdf(filename=pdf_path)
            paper_data["local_pdf_path"] = pdf_path
            print(f"   📥 Downloaded PDF")
        except Exception as e:
            print(f"   ⚠️  PDF download failed: {e}")
            paper_data["local_pdf_path"] = None
        
        return paper_data
        
    except Exception as e:
        print(f"❌ Failed to fetch seminal paper: {e}")
        raise


def get_citing_papers_from_semantic_scholar(
    seminal_arxiv_id: str, 
    max_papers: int = 70,
    existing_papers: Dict[str, Dict] = None
) -> List[Dict]:
    """
    Get papers that cite the seminal paper using Semantic Scholar API.
    
    Args:
        seminal_arxiv_id: ArXiv ID of seminal paper (e.g., "2308.04079")
        max_papers: Maximum number of citing papers to fetch
        existing_papers: Dict of already-fetched papers to skip
    
    Returns:
        List of paper metadata dictionaries
    """
    existing_papers = existing_papers or {}
    
    print(f"\n🔍 Fetching papers that cite {seminal_arxiv_id} from Semantic Scholar")
    print("=" * 80)
    
    # Create session with retry logic
    session = create_session()
    
    # Step 1: Get Semantic Scholar ID for the seminal paper
    print(f"\n📝 Step 1: Looking up Semantic Scholar ID for ArXiv:{seminal_arxiv_id}")
    
    lookup_url = f"{SEMANTIC_SCHOLAR_API_BASE}/paper/ARXIV:{seminal_arxiv_id}"
    params = {"fields": "paperId,title,citationCount"}
    
    try:
        response = session.get(lookup_url, params=params, timeout=30)
        response.raise_for_status()
        seminal_data = response.json()
        
        s2_paper_id = seminal_data['paperId']
        citation_count = seminal_data.get('citationCount', 0)
        
        print(f"✅ Found Semantic Scholar ID: {s2_paper_id}")
        print(f"📊 Total citations: {citation_count}")
        
    except Exception as e:
        print(f"❌ Failed to lookup seminal paper on Semantic Scholar: {e}")
        raise
    
    time.sleep(RATE_LIMIT_DELAY)
    
    # Step 2: Get citing papers
    print(f"\n📝 Step 2: Fetching up to {max_papers} citing papers")
    
    citations_url = f"{SEMANTIC_SCHOLAR_API_BASE}/paper/{s2_paper_id}/citations"
    
    # Request more papers than needed to account for ones without ArXiv IDs
    params = {
        "fields": "paperId,externalIds,title,abstract,authors,year,citationCount,influentialCitationCount",
        "limit": 1000  # Max allowed by API
    }
    
    citing_papers = []
    collected_count = 0
    skipped_no_arxiv = 0
    skipped_duplicate = 0
    
    try:
        response = session.get(citations_url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        citations = data.get('data', [])
        
        print(f"📥 Retrieved {len(citations)} citations from Semantic Scholar")
        print(f"\nProcessing citations to find papers with ArXiv IDs:")
        print("-" * 80)
        
        for citation in citations:
            if collected_count >= max_papers:
                break
            
            citing_paper = citation.get('citingPaper', {})
            
            # Get ArXiv ID
            external_ids = citing_paper.get('externalIds', {})
            arxiv_id = external_ids.get('ArXiv')
            
            if not arxiv_id:
                skipped_no_arxiv += 1
                continue
            
            # Skip if we already have this paper
            if arxiv_id in existing_papers:
                skipped_duplicate += 1
                continue
            
            # Create paper metadata
            paper_data = {
                "arxiv_id": arxiv_id,
                "title": citing_paper.get('title', 'Unknown'),
                "authors": [author.get('name', 'Unknown') for author in citing_paper.get('authors', [])],
                "abstract": citing_paper.get('abstract'),
                "published": f"{citing_paper.get('year', 'Unknown')}-01-01T00:00:00",  # Approximate
                "semantic_scholar_id": citing_paper.get('paperId'),
                "citation_count": citing_paper.get('citationCount', 0),
                "influential_citation_count": citing_paper.get('influentialCitationCount', 0),
                "is_seminal": False,
                "cites_seminal": True,  # This paper cites the seminal paper
                "search_strategy": "semantic_scholar_citations",
                "local_pdf_path": None  # Will download later
            }
            
            citing_papers.append(paper_data)
            collected_count += 1
            
            # Progress indicator
            if collected_count % 10 == 0:
                print(f"   [{collected_count}/{max_papers}] Collected papers with ArXiv IDs...")
        
        print(f"\n✅ Collected {len(citing_papers)} papers")
        print(f"   ⏭️  Skipped {skipped_no_arxiv} papers without ArXiv IDs")
        print(f"   🔄 Skipped {skipped_duplicate} duplicate papers")
        
        return citing_papers
        
    except Exception as e:
        print(f"❌ Failed to fetch citations: {e}")
        raise


def download_paper_pdf(arxiv_id: str, paper_data: Dict) -> bool:
    """
    Download PDF for a paper using ArXiv API.
    
    Args:
        arxiv_id: ArXiv ID of the paper
        paper_data: Paper metadata dict to update with PDF path
    
    Returns:
        True if download succeeded, False otherwise
    """
    pdf_path = f"papers/pdfs/{arxiv_id}.pdf"
    
    # Check if already downloaded
    if Path(pdf_path).exists():
        paper_data['local_pdf_path'] = pdf_path
        return True
    
    client = arxiv.Client()
    
    try:
        search = arxiv.Search(id_list=[arxiv_id])
        result = next(client.results(search))
        
        # Update metadata from ArXiv (more reliable than Semantic Scholar)
        paper_data['title'] = result.title
        paper_data['authors'] = [author.name for author in result.authors]
        paper_data['abstract'] = result.summary
        paper_data['published'] = result.published.isoformat()
        paper_data['updated'] = result.updated.isoformat()
        paper_data['pdf_url'] = result.pdf_url
        paper_data['categories'] = result.categories
        paper_data['primary_category'] = result.primary_category
        
        # Download PDF
        result.download_pdf(filename=pdf_path)
        paper_data['local_pdf_path'] = pdf_path
        
        return True
        
    except Exception as e:
        print(f"      ⚠️  Failed to download {arxiv_id}: {str(e)[:50]}")
        return False


def download_pdfs_batch(papers: List[Dict], batch_size: int = 5) -> None:
    """
    Download PDFs for papers in batches with progress tracking.
    
    Args:
        papers: List of paper metadata dicts
        batch_size: Number of papers to process before showing progress
    """
    print(f"\n📥 Downloading PDFs for {len(papers)} papers")
    print("=" * 80)
    
    success_count = 0
    fail_count = 0
    
    for i, paper in enumerate(papers, 1):
        arxiv_id = paper['arxiv_id']
        
        # Show progress
        if i % batch_size == 0 or i == 1:
            print(f"\n[{i}/{len(papers)}] Processing batch...")
        
        # Try to download
        if download_paper_pdf(arxiv_id, paper):
            success_count += 1
            print(f"   [{i}/{len(papers)}] ✅ {arxiv_id}: {paper['title'][:50]}...")
        else:
            fail_count += 1
            print(f"   [{i}/{len(papers)}] ❌ {arxiv_id}: Download failed")
        
        # Rate limiting
        time.sleep(1)
    
    print(f"\n📊 Download Summary:")
    print(f"   ✅ Successful: {success_count}")
    print(f"   ❌ Failed: {fail_count}")


def main():
    print("=" * 80)
    print("📚 Citation-Based Paper Collection for Knowledge Graph")
    print("=" * 80)
    
    # Load existing papers
    existing_papers = load_existing_papers()
    
    if existing_papers:
        print(f"\n📋 Found {len(existing_papers)} existing papers in database")
    
    # Step 1: Get seminal paper (or confirm it exists)
    seminal_paper = fetch_seminal_paper(existing_papers)
    
    # Add to collection if new
    if seminal_paper['arxiv_id'] not in existing_papers:
        existing_papers[seminal_paper['arxiv_id']] = seminal_paper
    
    time.sleep(2)
    
    # Step 2: Get citing papers from Semantic Scholar
    try:
        citing_papers = get_citing_papers_from_semantic_scholar(
            seminal_arxiv_id="2308.04079",
            max_papers=70,
            existing_papers=existing_papers
        )
    except Exception as e:
        print(f"\n❌ Failed to fetch citing papers: {e}")
        print(f"⚠️  Continuing with existing papers only")
        citing_papers = []
    
    time.sleep(2)
    
    # Step 3: Download PDFs for new papers
    if citing_papers:
        new_papers_count = len(citing_papers)
        print(f"\n🆕 Found {new_papers_count} new citing papers to download")
        
        user_input = input(f"\n▶️  Download PDFs for {new_papers_count} papers? (yes/no): ").strip().lower()
        
        if user_input in ['yes', 'y']:
            download_pdfs_batch(citing_papers)
            
            # Add to existing papers
            for paper in citing_papers:
                existing_papers[paper['arxiv_id']] = paper
        else:
            print("⏭️  Skipping PDF downloads")
    
    # Step 4: Save all papers (existing + new)
    all_papers = list(existing_papers.values())
    
    save_papers_metadata(all_papers)
    create_summary_csv(all_papers)
    
    # Print final summary
    print("\n" + "=" * 80)
    print("📊 FINAL SUMMARY")
    print("=" * 80)
    print(f"Total papers in collection: {len(all_papers)}")
    print(f"   - Seminal paper: 1")
    print(f"   - Papers citing seminal: {sum(1 for p in all_papers if p.get('cites_seminal', False))}")
    print(f"   - Other papers: {sum(1 for p in all_papers if not p.get('cites_seminal', False) and not p.get('is_seminal', False))}")
    
    pdfs_downloaded = sum(1 for p in all_papers if p.get('local_pdf_path'))
    pdfs_missing = len(all_papers) - pdfs_downloaded
    
    print(f"\nPDFs downloaded: {pdfs_downloaded}/{len(all_papers)}")
    if pdfs_missing > 0:
        print(f"   ⚠️  Missing PDFs: {pdfs_missing}")
    
    print(f"\n📁 Files:")
    print(f"   PDFs: papers/pdfs/ ({pdfs_downloaded} files)")
    print(f"   Metadata: papers/metadata/papers_metadata.json")
    print(f"   Summary: papers/metadata/papers_summary.csv")
    
    print("\n✨ Collection complete!")
    print("Next step: Extract text from PDFs and run entity extraction")


if __name__ == "__main__":
    main()