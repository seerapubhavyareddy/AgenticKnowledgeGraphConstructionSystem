#!/usr/bin/env python3
"""
Quick test script to verify database setup.
Run this after setting up your database to make sure everything works.
"""

import sys
from database_utils import DatabaseConnection

def main():
    print("=" * 70)
    print("🧪 Database Setup Verification")
    print("=" * 70)
    
    try:
        print("\n1️⃣  Testing database connection...")
        db = DatabaseConnection()
        
        if not db.test_connection():
            print("❌ FAILED: Could not connect to database")
            print("\nTroubleshooting steps:")
            print("  1. Check your .env file has DATABASE_URL set")
            print("  2. Verify connection string format")
            print("  3. Make sure database is running")
            return False
        
        print("   ✅ Connection successful!")
        
        print("\n2️⃣  Checking if tables exist...")
        tables_query = """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """
        tables = db.execute_query(tables_query)
        
        expected_tables = {
            'papers', 'concepts', 'paper_concepts', 
            'paper_relationships', 'extraction_logs'
        }
        found_tables = {row['table_name'] for row in tables}
        
        missing = expected_tables - found_tables
        if missing:
            print(f"   ❌ Missing tables: {', '.join(missing)}")
            print("\n   Run: python init_database.py")
            return False
        
        print(f"   ✅ All {len(expected_tables)} tables exist!")
        
        print("\n3️⃣  Checking database is empty (fresh start)...")
        stats = db.get_statistics()
        
        if stats['total_papers'] > 0:
            print(f"   ⚠️  Database already has {stats['total_papers']} papers")
            print("   This is fine if you've already started processing.")
        else:
            print("   ✅ Database is empty and ready!")
        
        print("\n4️⃣  Testing database operations...")
        
        # Try a simple insert and delete
        try:
            test_paper = {
                'arxiv_id': 'TEST_12345',
                'title': 'Test Paper',
                'abstract': 'This is a test',
                'authors': ['Test Author'],
                'published_date': '2024-01-01',
                'pdf_path': None,
                'full_text': 'Test content',
                'is_seminal': False
            }
            
            # Insert
            paper_id = db.insert_paper(test_paper)
            print(f"   ✅ Insert test passed (ID: {paper_id})")
            
            # Query
            paper = db.get_paper_by_arxiv_id('TEST_12345')
            if paper and paper['title'] == 'Test Paper':
                print("   ✅ Query test passed")
            else:
                print("   ❌ Query test failed")
                return False
            
            # Delete (cleanup)
            db.execute_update(
                "DELETE FROM papers WHERE arxiv_id = :arxiv_id",
                {'arxiv_id': 'TEST_12345'}
            )
            print("   ✅ Delete test passed")
            
        except Exception as e:
            print(f"   ❌ Operation test failed: {e}")
            return False
        
        print("\n" + "=" * 70)
        print("🎉 All Tests Passed!")
        print("=" * 70)
        print("\nYour database is properly set up and ready to use!")
        print("\nNext steps:")
        print("  1. Make sure you have your 20 papers collected")
        print("  2. Get your Anthropic API key ready")
        print("  3. Start building the extraction pipeline")
        
        # Print current stats
        print("\n")
        db.print_statistics()
        
        return True
        
    except ValueError as e:
        print(f"\n❌ Configuration error: {e}")
        print("\nMake sure you have:")
        print("  1. Created .env file (copy from .env.template)")
        print("  2. Set DATABASE_URL in .env")
        return False
        
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        print(f"\nError type: {type(e).__name__}")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)