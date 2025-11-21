# upload_to_database.py
import json
import psycopg2
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

# Load papers
with open('papers/metadata/papers_metadata.json') as f:
    papers = json.load(f)

# Connect to database
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

# Insert papers
for paper in papers:
    cur.execute("""
        INSERT INTO papers (arxiv_id, title, abstract, authors, published_date, pdf_path, full_text, is_seminal)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (arxiv_id) DO NOTHING
    """, (
        paper['arxiv_id'],
        paper['title'],
        paper.get('abstract'),
        paper.get('authors', []),
        paper.get('published'),
        paper.get('local_pdf_path'),
        None,  # full_text - extract later
        paper.get('is_seminal', False)
    ))

conn.commit()
print(f"✅ Uploaded {len(papers)} papers")
cur.close()
conn.close()