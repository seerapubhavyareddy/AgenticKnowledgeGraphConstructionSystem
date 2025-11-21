"""
Database initialization script for Knowledge Graph system.
Creates all necessary tables and indexes.
"""

import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database schema SQL
SCHEMA_SQL = """
-- ============================================================================
-- Table 1: papers
-- Stores metadata and content for each research paper
-- ============================================================================

CREATE TABLE IF NOT EXISTS papers (
    id SERIAL PRIMARY KEY,
    arxiv_id VARCHAR(50) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT,
    authors TEXT[],  -- PostgreSQL array type
    published_date DATE,
    pdf_path TEXT,
    full_text TEXT,
    
    -- Metadata
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_seminal BOOLEAN DEFAULT FALSE,
    
    -- Full-text search vectors (auto-generated)
    tsv_title tsvector GENERATED ALWAYS AS (to_tsvector('english', title)) STORED,
    tsv_abstract tsvector GENERATED ALWAYS AS (to_tsvector('english', COALESCE(abstract, ''))) STORED
);

-- Indexes for papers table
CREATE INDEX IF NOT EXISTS idx_papers_arxiv ON papers(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_papers_title_search ON papers USING GIN(tsv_title);
CREATE INDEX IF NOT EXISTS idx_papers_abstract_search ON papers USING GIN(tsv_abstract);
CREATE INDEX IF NOT EXISTS idx_papers_published ON papers(published_date);

COMMENT ON TABLE papers IS 'Research papers with full content and metadata';
COMMENT ON COLUMN papers.tsv_title IS 'Full-text search vector for title';
COMMENT ON COLUMN papers.is_seminal IS 'Flag for important/foundational papers';

-- ============================================================================
-- Table 2: concepts
-- Stores extracted concepts, methods, techniques, datasets
-- ============================================================================

CREATE TABLE IF NOT EXISTS concepts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    concept_type VARCHAR(50),  -- 'method', 'technique', 'dataset', 'metric', 'concept'
    
    -- Statistics
    mention_count INTEGER DEFAULT 1,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for concepts table
CREATE INDEX IF NOT EXISTS idx_concepts_name ON concepts(name);
CREATE INDEX IF NOT EXISTS idx_concepts_type ON concepts(concept_type);
CREATE INDEX IF NOT EXISTS idx_concepts_mention_count ON concepts(mention_count DESC);

COMMENT ON TABLE concepts IS 'Unique concepts/methods/techniques extracted from papers';
COMMENT ON COLUMN concepts.mention_count IS 'Number of papers mentioning this concept';

-- ============================================================================
-- Table 3: paper_concepts
-- Links papers to concepts (many-to-many relationship)
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_concepts (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    
    -- Relevance of this concept to the paper
    relevance_score FLOAT CHECK (relevance_score BETWEEN 0 AND 1),
    
    -- Where in the paper was this mentioned
    context TEXT,  -- Snippet of text where concept appears
    
    -- Prevent duplicate links
    UNIQUE(paper_id, concept_id)
);

-- Indexes for paper_concepts table
CREATE INDEX IF NOT EXISTS idx_paper_concepts_paper ON paper_concepts(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_concepts_concept ON paper_concepts(concept_id);
CREATE INDEX IF NOT EXISTS idx_paper_concepts_relevance ON paper_concepts(relevance_score DESC);

COMMENT ON TABLE paper_concepts IS 'Many-to-many relationship between papers and concepts';
COMMENT ON COLUMN paper_concepts.relevance_score IS 'How central this concept is to the paper (0-1)';

-- ============================================================================
-- Table 4: paper_relationships
-- Stores semantic relationships between papers (the heart of the graph!)
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_relationships (
    id SERIAL PRIMARY KEY,
    source_paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    target_paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    
    -- Type of relationship
    relationship_type VARCHAR(50) NOT NULL,
    -- Valid types: 'improves_on', 'extends', 'evaluates', 'builds_on', 'addresses', 'cites'
    
    -- Natural language explanation of the relationship
    explanation TEXT NOT NULL,
    
    -- Confidence score from LLM extraction (0.0 to 1.0)
    confidence FLOAT CHECK (confidence BETWEEN 0 AND 1),
    
    -- Metadata
    extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validated BOOLEAN DEFAULT FALSE,
    
    -- Prevent duplicate relationships
    UNIQUE(source_paper_id, target_paper_id, relationship_type),
    
    -- Prevent self-references
    CHECK (source_paper_id != target_paper_id)
);

-- Indexes for paper_relationships table
CREATE INDEX IF NOT EXISTS idx_relationships_source ON paper_relationships(source_paper_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON paper_relationships(target_paper_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON paper_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_confidence ON paper_relationships(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_relationships_validated ON paper_relationships(validated);

COMMENT ON TABLE paper_relationships IS 'Semantic relationships between papers (directed graph edges)';
COMMENT ON COLUMN paper_relationships.explanation IS 'Natural language description of how papers relate';
COMMENT ON COLUMN paper_relationships.confidence IS 'LLM confidence in this relationship (0-1)';

-- ============================================================================
-- Table 5: extraction_logs
-- Tracks processing status and errors for debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS extraction_logs (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL,  -- 'pdf_extraction', 'entity_extraction', 'relationship_extraction'
    status VARCHAR(20) NOT NULL,  -- 'success', 'failed', 'in_progress'
    error_message TEXT,
    processing_time_seconds FLOAT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for extraction_logs table
CREATE INDEX IF NOT EXISTS idx_logs_paper ON extraction_logs(paper_id);
CREATE INDEX IF NOT EXISTS idx_logs_status ON extraction_logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_created ON extraction_logs(created_at DESC);

COMMENT ON TABLE extraction_logs IS 'Logging table for tracking processing pipeline';

-- ============================================================================
-- Views for common queries
-- ============================================================================

-- View: Papers with their concept counts
CREATE OR REPLACE VIEW paper_concept_summary AS
SELECT 
    p.id,
    p.arxiv_id,
    p.title,
    COUNT(pc.concept_id) AS concept_count,
    p.is_seminal
FROM papers p
LEFT JOIN paper_concepts pc ON p.id = pc.paper_id
GROUP BY p.id;

COMMENT ON VIEW paper_concept_summary IS 'Summary of papers with their concept counts';

-- View: Most influential concepts
CREATE OR REPLACE VIEW top_concepts AS
SELECT 
    c.id,
    c.name,
    c.concept_type,
    c.mention_count,
    COUNT(DISTINCT pc.paper_id) AS paper_count
FROM concepts c
LEFT JOIN paper_concepts pc ON c.id = pc.id
GROUP BY c.id
ORDER BY paper_count DESC;

COMMENT ON VIEW top_concepts IS 'Concepts ranked by number of papers mentioning them';

-- View: Relationship summary
CREATE OR REPLACE VIEW relationship_summary AS
SELECT 
    relationship_type,
    COUNT(*) AS count,
    AVG(confidence) AS avg_confidence,
    COUNT(CASE WHEN validated THEN 1 END) AS validated_count
FROM paper_relationships
GROUP BY relationship_type
ORDER BY count DESC;

COMMENT ON VIEW relationship_summary IS 'Statistics about relationship types in the graph';

-- ============================================================================
-- Sample Queries (stored as comments for reference)
-- ============================================================================

/*
-- Query 1: Find all papers that improve the seminal paper
SELECT 
    p.title AS improving_paper,
    pr.explanation,
    pr.confidence
FROM paper_relationships pr
JOIN papers p ON pr.source_paper_id = p.id
JOIN papers target ON pr.target_paper_id = target.id
WHERE target.is_seminal = TRUE
  AND pr.relationship_type = 'improves_on'
ORDER BY pr.confidence DESC;

-- Query 2: Find most mentioned concepts
SELECT 
    name,
    concept_type,
    mention_count
FROM concepts
ORDER BY mention_count DESC
LIMIT 10;

-- Query 3: Papers similar by shared concepts
SELECT 
    p2.title AS similar_paper,
    COUNT(DISTINCT pc1.concept_id) AS shared_concepts
FROM papers p1
JOIN paper_concepts pc1 ON p1.id = pc1.paper_id
JOIN paper_concepts pc2 ON pc1.concept_id = pc2.concept_id
JOIN papers p2 ON pc2.paper_id = p2.id
WHERE p1.arxiv_id = '2308.04079'  -- The seminal paper
  AND p2.id != p1.id
GROUP BY p2.id, p2.title
ORDER BY shared_concepts DESC
LIMIT 10;

-- Query 4: Full-text search papers
SELECT 
    arxiv_id,
    title,
    ts_rank(tsv_title, query) + ts_rank(tsv_abstract, query) AS rank
FROM papers, 
     to_tsquery('english', 'real & time & rendering') AS query
WHERE tsv_title @@ query OR tsv_abstract @@ query
ORDER BY rank DESC;

-- Query 5: Papers with no relationships (potential issues)
SELECT 
    arxiv_id,
    title
FROM papers p
WHERE NOT EXISTS (
    SELECT 1 FROM paper_relationships 
    WHERE source_paper_id = p.id OR target_paper_id = p.id
);
*/

-- ============================================================================
-- Success message
-- ============================================================================

DO $$ 
BEGIN 
    RAISE NOTICE '✅ Database schema initialized successfully!';
    RAISE NOTICE 'Tables created: papers, concepts, paper_concepts, paper_relationships, extraction_logs';
    RAISE NOTICE 'Views created: paper_concept_summary, top_concepts, relationship_summary';
    RAISE NOTICE 'You are ready to start processing papers!';
END $$;
"""


def init_database(database_url: str = None):
    """
    Initialize the database with all tables and indexes.
    
    Args:
        database_url: PostgreSQL connection string. 
                     If None, reads from DATABASE_URL environment variable.
    """
    # Get database URL
    if database_url is None:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise ValueError(
                "DATABASE_URL not found! "
                "Set it in .env file or pass as argument."
            )
    
    print("=" * 70)
    print("🗄️  Initializing Knowledge Graph Database")
    print("=" * 70)
    
    # Create database engine
    print(f"\n📡 Connecting to database...")
    try:
        engine = create_engine(database_url)
        print("✅ Connected successfully!")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False
    
    # Execute schema SQL
    print(f"\n🔨 Creating tables and indexes...")
    try:
        with engine.connect() as conn:
            # Execute the schema
            conn.execute(text(SCHEMA_SQL))
            conn.commit()
        
        print("✅ Schema created successfully!")
        
    except Exception as e:
        print(f"❌ Schema creation failed: {e}")
        return False
    
    # Verify tables were created
    print(f"\n🔍 Verifying tables...")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """))
            
            tables = [row[0] for row in result]
            
            print(f"✅ Found {len(tables)} tables:")
            for table in tables:
                print(f"   • {table}")
        
    except Exception as e:
        print(f"⚠️  Could not verify tables: {e}")
    
    # Print summary
    print("\n" + "=" * 70)
    print("🎉 Database Initialization Complete!")
    print("=" * 70)
    print("\nYour database is ready with:")
    print("  • 5 tables (papers, concepts, paper_concepts, paper_relationships, extraction_logs)")
    print("  • 15+ indexes for fast queries")
    print("  • 3 helpful views for common queries")
    print("  • Full-text search enabled on titles and abstracts")
    print("\nNext step: Start processing papers with the extraction pipeline!")
    
    return True


if __name__ == "__main__":
    import sys
    
    # Always read from .env file
    db_url = None  # Will be loaded from .env by init_database()
    
    # Initialize database
    success = init_database(db_url)
    
    if not success:
        print("\n❌ Database initialization failed!")
        print("\nTroubleshooting:")
        print("1. Make sure DATABASE_URL is set in your .env file")
        print("2. Check that your database is running")
        print("3. Verify connection string format:")
        print("   postgresql://user:password@host:port/database")
        print("4. If password has special characters (like #), URL-encode them:")
        print("   Run: python encode_password.py")
        sys.exit(1)
    
    sys.exit(0)