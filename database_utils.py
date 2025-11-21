"""
Database utilities for Knowledge Graph system.
Provides helper functions for common database operations.
"""

import os
from typing import List, Dict, Optional, Any
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class DatabaseConnection:
    """Manages database connection and provides helper methods."""
    
    def __init__(self, database_url: str = None):
        """
        Initialize database connection.
        
        Args:
            database_url: PostgreSQL connection string.
                         If None, reads from DATABASE_URL env variable.
        """
        self.database_url = database_url or os.getenv('DATABASE_URL')
        if not self.database_url:
            raise ValueError("DATABASE_URL not provided!")
        
        self.engine = create_engine(self.database_url)
        self.SessionLocal = sessionmaker(bind=self.engine)
    
    def test_connection(self) -> bool:
        """Test if database connection works."""
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception as e:
            print(f"❌ Connection test failed: {e}")
            return False
    
    def execute_query(self, query: str, params: Dict = None) -> List[Dict]:
        """
        Execute a SELECT query and return results as list of dicts.
        
        Args:
            query: SQL query string
            params: Query parameters (optional)
        
        Returns:
            List of dictionaries with query results
        """
        with self.engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result]
    
    def execute_update(self, query: str, params: Dict = None) -> int:
        """
        Execute an INSERT/UPDATE/DELETE query.
        
        Args:
            query: SQL query string
            params: Query parameters (optional)
        
        Returns:
            Number of affected rows
        """
        with self.engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            conn.commit()
            return result.rowcount
    
    # ========================================================================
    # Paper Operations
    # ========================================================================
    
    def insert_paper(self, paper_data: Dict) -> int:
        """
        Insert a new paper into the database.
        
        Args:
            paper_data: Dictionary with paper information
                {
                    'arxiv_id': str,
                    'title': str,
                    'abstract': str,
                    'authors': List[str],
                    'published_date': str (YYYY-MM-DD),
                    'pdf_path': str,
                    'full_text': str,
                    'is_seminal': bool
                }
        
        Returns:
            ID of inserted paper
        """
        query = """
        INSERT INTO papers (
            arxiv_id, title, abstract, authors, published_date, 
            pdf_path, full_text, is_seminal
        ) VALUES (
            :arxiv_id, :title, :abstract, :authors, :published_date,
            :pdf_path, :full_text, :is_seminal
        )
        ON CONFLICT (arxiv_id) DO UPDATE SET
            title = EXCLUDED.title,
            abstract = EXCLUDED.abstract,
            full_text = EXCLUDED.full_text
        RETURNING id;
        """
        
        with self.engine.connect() as conn:
            result = conn.execute(text(query), paper_data)
            conn.commit()
            return result.fetchone()[0]
    
    def get_paper_by_arxiv_id(self, arxiv_id: str) -> Optional[Dict]:
        """Get paper by its ArXiv ID."""
        query = "SELECT * FROM papers WHERE arxiv_id = :arxiv_id"
        results = self.execute_query(query, {'arxiv_id': arxiv_id})
        return results[0] if results else None
    
    def get_all_papers(self) -> List[Dict]:
        """Get all papers in the database."""
        query = "SELECT * FROM papers ORDER BY published_date DESC"
        return self.execute_query(query)
    
    # ========================================================================
    # Concept Operations
    # ========================================================================
    
    def insert_concept(self, name: str, concept_type: str, description: str = None) -> int:
        """
        Insert a new concept or update if it exists.
        
        Args:
            name: Concept name (unique)
            concept_type: Type ('method', 'technique', 'dataset', 'metric', 'concept')
            description: Optional description
        
        Returns:
            ID of concept
        """
        query = """
        INSERT INTO concepts (name, concept_type, description)
        VALUES (:name, :concept_type, :description)
        ON CONFLICT (name) DO UPDATE SET
            mention_count = concepts.mention_count + 1
        RETURNING id;
        """
        
        with self.engine.connect() as conn:
            result = conn.execute(text(query), {
                'name': name,
                'concept_type': concept_type,
                'description': description
            })
            conn.commit()
            return result.fetchone()[0]
    
    def link_paper_concept(
        self, 
        paper_id: int, 
        concept_id: int, 
        relevance_score: float = None,
        context: str = None
    ):
        """
        Create link between paper and concept.
        
        Args:
            paper_id: Paper ID
            concept_id: Concept ID
            relevance_score: How relevant this concept is (0-1)
            context: Text snippet where concept appears
        """
        query = """
        INSERT INTO paper_concepts (paper_id, concept_id, relevance_score, context)
        VALUES (:paper_id, :concept_id, :relevance_score, :context)
        ON CONFLICT (paper_id, concept_id) DO NOTHING;
        """
        
        self.execute_update(query, {
            'paper_id': paper_id,
            'concept_id': concept_id,
            'relevance_score': relevance_score,
            'context': context
        })
    
    # ========================================================================
    # Relationship Operations
    # ========================================================================
    
    def insert_relationship(
        self,
        source_paper_id: int,
        target_paper_id: int,
        relationship_type: str,
        explanation: str,
        confidence: float
    ) -> int:
        """
        Insert a relationship between two papers.
        
        Args:
            source_paper_id: Source paper ID
            target_paper_id: Target paper ID
            relationship_type: Type ('improves_on', 'extends', etc.)
            explanation: Natural language explanation
            confidence: Confidence score (0-1)
        
        Returns:
            ID of relationship
        """
        query = """
        INSERT INTO paper_relationships (
            source_paper_id, target_paper_id, relationship_type,
            explanation, confidence
        ) VALUES (
            :source_paper_id, :target_paper_id, :relationship_type,
            :explanation, :confidence
        )
        ON CONFLICT (source_paper_id, target_paper_id, relationship_type) 
        DO UPDATE SET
            explanation = EXCLUDED.explanation,
            confidence = EXCLUDED.confidence
        RETURNING id;
        """
        
        with self.engine.connect() as conn:
            result = conn.execute(text(query), {
                'source_paper_id': source_paper_id,
                'target_paper_id': target_paper_id,
                'relationship_type': relationship_type,
                'explanation': explanation,
                'confidence': confidence
            })
            conn.commit()
            return result.fetchone()[0]
    
    def get_paper_relationships(
        self, 
        paper_id: int, 
        min_confidence: float = 0.0
    ) -> List[Dict]:
        """
        Get all relationships for a paper.
        
        Args:
            paper_id: Paper ID
            min_confidence: Minimum confidence score to include
        
        Returns:
            List of relationships
        """
        query = """
        SELECT 
            pr.id,
            pr.relationship_type,
            pr.explanation,
            pr.confidence,
            source.title AS source_title,
            target.title AS target_title,
            target.arxiv_id AS target_arxiv_id
        FROM paper_relationships pr
        JOIN papers source ON pr.source_paper_id = source.id
        JOIN papers target ON pr.target_paper_id = target.id
        WHERE (pr.source_paper_id = :paper_id OR pr.target_paper_id = :paper_id)
          AND pr.confidence >= :min_confidence
        ORDER BY pr.confidence DESC;
        """
        
        return self.execute_query(query, {
            'paper_id': paper_id,
            'min_confidence': min_confidence
        })
    
    # ========================================================================
    # Logging Operations
    # ========================================================================
    
    def log_extraction(
        self,
        paper_id: int,
        stage: str,
        status: str,
        error_message: str = None,
        processing_time: float = None
    ):
        """
        Log processing stage for a paper.
        
        Args:
            paper_id: Paper ID
            stage: Processing stage ('pdf_extraction', 'entity_extraction', etc.)
            status: Status ('success', 'failed', 'in_progress')
            error_message: Error message if failed
            processing_time: Time taken in seconds
        """
        query = """
        INSERT INTO extraction_logs (
            paper_id, stage, status, error_message, processing_time_seconds
        ) VALUES (
            :paper_id, :stage, :status, :error_message, :processing_time
        );
        """
        
        self.execute_update(query, {
            'paper_id': paper_id,
            'stage': stage,
            'status': status,
            'error_message': error_message,
            'processing_time': processing_time
        })
    
    # ========================================================================
    # Statistics & Analytics
    # ========================================================================
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get overall database statistics."""
        stats = {}
        
        # Count papers
        result = self.execute_query("SELECT COUNT(*) as count FROM papers")
        stats['total_papers'] = result[0]['count']
        
        # Count concepts
        result = self.execute_query("SELECT COUNT(*) as count FROM concepts")
        stats['total_concepts'] = result[0]['count']
        
        # Count relationships
        result = self.execute_query("SELECT COUNT(*) as count FROM paper_relationships")
        stats['total_relationships'] = result[0]['count']
        
        # Average relationships per paper
        result = self.execute_query("""
            SELECT AVG(rel_count) as avg_relationships
            FROM (
                SELECT COUNT(*) as rel_count
                FROM paper_relationships
                GROUP BY source_paper_id
            ) subq
        """)
        stats['avg_relationships_per_paper'] = round(result[0]['avg_relationships'] or 0, 2)
        
        # Relationship type breakdown
        result = self.execute_query("""
            SELECT relationship_type, COUNT(*) as count
            FROM paper_relationships
            GROUP BY relationship_type
            ORDER BY count DESC
        """)
        stats['relationships_by_type'] = {
            row['relationship_type']: row['count'] 
            for row in result
        }
        
        # Top concepts
        result = self.execute_query("""
            SELECT name, mention_count
            FROM concepts
            ORDER BY mention_count DESC
            LIMIT 5
        """)
        stats['top_concepts'] = [
            {'name': row['name'], 'mentions': row['mention_count']}
            for row in result
        ]
        
        return stats
    
    def print_statistics(self):
        """Print database statistics in a nice format."""
        stats = self.get_statistics()
        
        print("\n" + "=" * 70)
        print("📊 Knowledge Graph Statistics")
        print("=" * 70)
        
        print(f"\n📄 Papers: {stats['total_papers']}")
        print(f"🔖 Concepts: {stats['total_concepts']}")
        print(f"🔗 Relationships: {stats['total_relationships']}")
        print(f"📈 Avg relationships per paper: {stats['avg_relationships_per_paper']}")
        
        if stats['relationships_by_type']:
            print(f"\n🔗 Relationships by type:")
            for rel_type, count in stats['relationships_by_type'].items():
                print(f"   • {rel_type}: {count}")
        
        if stats['top_concepts']:
            print(f"\n⭐ Top concepts:")
            for concept in stats['top_concepts']:
                print(f"   • {concept['name']}: {concept['mentions']} mentions")
        
        print("\n" + "=" * 70)


# ============================================================================
# Example Usage & Testing
# ============================================================================

def test_database():
    """Test database connection and basic operations."""
    print("🧪 Testing database connection...")
    
    try:
        db = DatabaseConnection()
        
        # Test connection
        if not db.test_connection():
            print("❌ Database connection failed!")
            return False
        
        print("✅ Database connection successful!")
        
        # Print statistics
        db.print_statistics()
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False


if __name__ == "__main__":
    test_database()