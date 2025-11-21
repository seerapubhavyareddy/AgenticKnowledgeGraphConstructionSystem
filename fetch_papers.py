#!/usr/bin/env python3
"""
Improved ArXiv paper fetcher with multiple search strategies.
Focuses on getting high-quality Gaussian Splatting papers.
"""

import arxiv
import json
from pathlib import Path
from typing import List, Dict
import time
from datetime import datetime

# Create directories
Path("papers/pdfs").mkdir(parents=True, exist_ok=True)
Path("papers/metadata").mkdir(parents=True, exist_ok=True)

def fetch_seminal_paper() -> Dict:
    """Fetch the seminal 3D Gaussian Splatting paper."""
    print("\n🌟 Fetching seminal paper: 3D Gaussian Splatting for Real-Time Radiance Field Rendering")
    print("=" * 80)
    
    client = arxiv.Client()
    search = arxiv.Search(id_list=["2308.04079"])
    
    result = next(client.results(search))
    
    paper_data = {
        "arxiv_id": "2308.04079",
        "title": result.title,
        "authors": [author.name for author in result.authors],
        "abstract": result.summary,
        "published": result.published.isoformat(),
        "updated": result.updated.isoformat(),
        "pdf_url": result.pdf_url,
        "categories": result.categories,
        "primary_category": result.primary_category,
        "is_seminal": True,
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


def search_papers_strategy(query: str, max_results: int, strategy_name: str) -> List[Dict]:
    """
    Search papers with a specific query strategy.
    
    Args:
        query: Search query string
        max_results: Number of results to fetch
        strategy_name: Name of the search strategy (for logging)
    
    Returns:
        List of paper metadata dictionaries
    """
    print(f"\n🔍 Strategy: {strategy_name}")
    print(f"   Query: '{query}'")
    print(f"   Target: {max_results} papers")
    print("-" * 80)
    
    client = arxiv.Client()
    
    search = arxiv.Search(
        query=query,
        max_results=max_results * 2,  # Fetch extra in case of duplicates
        sort_by=arxiv.SortCriterion.Relevance
    )
    
    papers = []
    seen_ids = set()
    
    for result in client.results(search):
        if len(papers) >= max_results:
            break
            
        arxiv_id = result.entry_id.split("/")[-1].replace("v1", "").replace("v2", "").replace("v3", "")
        
        # Skip duplicates
        if arxiv_id in seen_ids:
            continue
        seen_ids.add(arxiv_id)
        
        paper_data = {
            "arxiv_id": arxiv_id,
            "title": result.title,
            "authors": [author.name for author in result.authors],
            "abstract": result.summary,
            "published": result.published.isoformat(),
            "updated": result.updated.isoformat(),
            "pdf_url": result.pdf_url,
            "categories": result.categories,
            "primary_category": result.primary_category,
            "is_seminal": False,
            "search_strategy": strategy_name
        }
        
        papers.append(paper_data)
        
        print(f"   [{len(papers)}/{max_results}] {paper_data['title'][:65]}...")
        
        # Download PDF
        pdf_path = f"papers/pdfs/{arxiv_id}.pdf"
        try:
            result.download_pdf(filename=pdf_path)
            paper_data["local_pdf_path"] = pdf_path
            print(f"        ✅ PDF")
        except Exception as e:
            print(f"        ⚠️  PDF failed: {str(e)[:40]}")
            paper_data["local_pdf_path"] = None
        
        # Rate limiting
        time.sleep(1)
    
    print(f"   ✅ Collected {len(papers)} papers from this strategy")
    return papers


def main():
    print("=" * 80)
    print("📚 Gaussian Splatting Paper Collection - Multi-Strategy Approach")
    print("=" * 80)
    
    all_papers = []
    seen_ids = set()
    
    # Strategy 0: Get the seminal paper
    seminal_paper = fetch_seminal_paper()
    all_papers.append(seminal_paper)
    seen_ids.add(seminal_paper['arxiv_id'])
    
    time.sleep(2)
    
    # Strategy 1: Direct Gaussian Splatting papers (most relevant)
    strategy1_papers = search_papers_strategy(
        query='ti:"Gaussian Splatting" OR abs:"Gaussian Splatting"',
        max_results=8,
        strategy_name="Direct Gaussian Splatting mentions"
    )
    
    time.sleep(2)
    
    # Strategy 2: 3D reconstruction with Gaussian methods
    strategy2_papers = search_papers_strategy(
        query="3D reconstruction Gaussian radiance field",
        max_results=5,
        strategy_name="3D reconstruction + Gaussian"
    )
    
    time.sleep(2)
    
    # Strategy 3: Neural rendering and novel view synthesis
    strategy3_papers = search_papers_strategy(
        query="neural rendering novel view synthesis real-time",
        max_results=3,
        strategy_name="Neural rendering related"
    )
    
    time.sleep(2)
    
    # Strategy 4: Recent computer vision/graphics papers
    strategy4_papers = search_papers_strategy(
        query="3D scene representation NeRF splatting",
        max_results=3,
        strategy_name="3D scene representation"
    )
    
    # Combine all papers, removing duplicates
    for paper in strategy1_papers + strategy2_papers + strategy3_papers + strategy4_papers:
        if paper['arxiv_id'] not in seen_ids:
            all_papers.append(paper)
            seen_ids.add(paper['arxiv_id'])
    
    # Trim to exactly 20 papers
    all_papers = all_papers[:20]
    
    # Save metadata
    output_path = "papers/metadata/papers_metadata.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_papers, f, indent=2, ensure_ascii=False)
    
    # Create a summary CSV for easy viewing
    summary_path = "papers/metadata/papers_summary.csv"
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write("arxiv_id,title,authors,published,has_pdf,search_strategy\n")
        for p in all_papers:
            title_clean = p['title'].replace(',', ';').replace('\n', ' ')
            authors_str = '; '.join(p['authors'][:2])
            has_pdf = 'Yes' if p.get('local_pdf_path') else 'No'
            published_date = p['published'][:10]
            f.write(f"{p['arxiv_id']},{title_clean},{authors_str},{published_date},{has_pdf},{p['search_strategy']}\n")
    
    # Print final summary
    print("\n" + "=" * 80)
    print("📊 FINAL SUMMARY")
    print("=" * 80)
    print(f"Total papers collected: {len(all_papers)}")
    print(f"PDFs downloaded: {sum(1 for p in all_papers if p.get('local_pdf_path'))}")
    print(f"PDFs failed: {sum(1 for p in all_papers if not p.get('local_pdf_path'))}")
    
    print(f"\n📁 Distribution by search strategy:")
    strategy_counts = {}
    for p in all_papers:
        strategy = p.get('search_strategy', 'unknown')
        strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
    
    for strategy, count in sorted(strategy_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"   {strategy}: {count} papers")
    
    print(f"\n📄 Files saved:")
    print(f"   Papers: papers/pdfs/ ({sum(1 for p in all_papers if p.get('local_pdf_path'))} PDFs)")
    print(f"   Metadata (JSON): {output_path}")
    print(f"   Summary (CSV): {summary_path}")
    
    print(f"\n📋 Paper titles collected:")
    for i, p in enumerate(all_papers, 1):
        indicator = "✅" if p.get('local_pdf_path') else "⚠️ "
        print(f"   {i:2d}. {indicator} {p['title'][:70]}...")
    
    print("\n✨ Collection complete!")
    print(f"Next step: Extract text from PDFs and start building your knowledge graph!")


if __name__ == "__main__":
    main()