/**
 * Database client for PostgreSQL operations
 * Handles all database interactions for the knowledge graph
 */

import { Pool, QueryResult } from 'pg';
import {
    PaperRow,
    ConceptRow,
    PaperConceptRow,
    ExtractionLogRow,
    ExtractionStage,
    ExtractionStatus,
    ConceptType,
    RelationshipType,
    PaperRelationshipRow
} from './types';

export class DatabaseClient {
    private pool: Pool;

    constructor(connectionString: string) {
        this.pool = new Pool({
            connectionString,
            max: 20, // Maximum pool size
            idleTimeoutMillis: 60000,      // Change: 30000 → 60000
            connectionTimeoutMillis: 10000, // Change: 2000 → 10000
            query_timeout: 30000,           // Add this
            statement_timeout: 30000        // Add this
        });

        // Handle connection errors
        this.pool.on('error', (err) => {
            console.error('Unexpected database error:', err);
        });
    }

    /**
     * Test database connection
     */
    async testConnection(): Promise<boolean> {
        try {
            const result = await this.pool.query('SELECT NOW()');
            console.log('✅ Database connected successfully at:', result.rows[0].now);
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            return false;
        }
    }

    /**
     * Get a single paper by ID
     */
    async getPaperById(paperId: number): Promise<PaperRow | null> {
        const result = await this.pool.query<PaperRow>(
            'SELECT * FROM papers WHERE id = $1',
            [paperId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get all papers that haven't been processed for entity extraction yet
     */
    async getUnprocessedPapers(): Promise<PaperRow[]> {
        const query = `
      SELECT p.* 
      FROM papers p
      WHERE NOT EXISTS (
        SELECT 1 FROM extraction_logs el
        WHERE el.paper_id = p.id 
        AND el.stage = 'entity_extraction'
        AND el.status = 'success'
      )
      ORDER BY p.id
    `;

        const result = await this.pool.query<PaperRow>(query);
        return result.rows;
    }

    /**
     * Get all papers (for full processing)
     */
    async getAllPapers(): Promise<PaperRow[]> {
        const result = await this.pool.query<PaperRow>(
            'SELECT * FROM papers ORDER BY id'
        );
        return result.rows;
    }

    /**
     * Insert or update a concept
     * Returns the concept ID (existing or newly created)
     */
    async upsertConcept(
        name: string,
        conceptType: ConceptType,
        description: string
    ): Promise<number> {
        const query = `
      INSERT INTO concepts (name, concept_type, description, mention_count)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (name) 
      DO UPDATE SET 
        mention_count = concepts.mention_count + 1,
        description = COALESCE(EXCLUDED.description, concepts.description)
      RETURNING id
    `;

        const result = await this.pool.query<{ id: number }>(
            query,
            [name, conceptType, description]
        );

        return result.rows[0].id;
    }

    /**
     * Link a paper to a concept
     */
    async linkPaperToConcept(
        paperId: number,
        conceptId: number,
        relevanceScore: number,
        context: string
    ): Promise<void> {
        const query = `
      INSERT INTO paper_concepts (paper_id, concept_id, relevance_score, context)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (paper_id, concept_id) 
      DO UPDATE SET 
        relevance_score = EXCLUDED.relevance_score,
        context = EXCLUDED.context
    `;

        await this.pool.query(query, [paperId, conceptId, relevanceScore, context]);
    }

    /**
     * Log extraction progress/errors
     */
    async logExtraction(
        paperId: number,
        stage: ExtractionStage,
        status: ExtractionStatus,
        errorMessage: string | null = null,
        processingTimeSeconds: number | null = null
    ): Promise<void> {
        const query = `
      INSERT INTO extraction_logs 
        (paper_id, stage, status, error_message, processing_time_seconds)
      VALUES ($1, $2, $3, $4, $5)
    `;

        await this.pool.query(query, [
            paperId,
            stage,
            status,
            errorMessage,
            processingTimeSeconds
        ]);
    }

    /**
     * Get extraction logs for a specific paper
     */
    async getExtractionLogs(paperId: number): Promise<ExtractionLogRow[]> {
        const result = await this.pool.query<ExtractionLogRow>(
            'SELECT * FROM extraction_logs WHERE paper_id = $1 ORDER BY created_at DESC',
            [paperId]
        );
        return result.rows;
    }

    /**
     * Get concepts linked to a paper
     * getPaperConcepts method signature includes minRelevance parameter
     */
    async getPaperConcepts(paperId: number, minRelevance: number = 0.0): Promise<ConceptRow[]> {
        const query = `
      SELECT c.*, pc.relevance_score, pc.context
      FROM concepts c
      JOIN paper_concepts pc ON c.id = pc.concept_id
      WHERE pc.paper_id = $1 AND pc.relevance_score >= $2
      ORDER BY pc.relevance_score DESC
    `;

        const result = await this.pool.query<ConceptRow>(query, [paperId, minRelevance]);
        return result.rows;
    }

    /**
     * Get statistics about the database
     */
    async getStats(): Promise<{
        totalPapers: number;
        totalConcepts: number;
        totalLinks: number;
        processedPapers: number;
    }> {
        const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM papers) as total_papers,
        (SELECT COUNT(*) FROM concepts) as total_concepts,
        (SELECT COUNT(*) FROM paper_concepts) as total_links,
        (SELECT COUNT(DISTINCT paper_id) FROM extraction_logs 
         WHERE stage = 'entity_extraction' AND status = 'success') as processed_papers
    `;

        const result = await this.pool.query(statsQuery);
        const row = result.rows[0];

        return {
            totalPapers: parseInt(row.total_papers),
            totalConcepts: parseInt(row.total_concepts),
            totalLinks: parseInt(row.total_links),
            processedPapers: parseInt(row.processed_papers)
        };
    }

    /**
 * Get the seminal paper (marked with is_seminal = true)
 */
    async getSeminalPaper(): Promise<PaperRow | null> {
        const result = await this.pool.query<PaperRow>(
            'SELECT * FROM papers WHERE is_seminal = true LIMIT 1'
        );
        return result.rows[0] || null;
    }

    /**
     * Get shared concepts between two papers
     */
    async getSharedConcepts(
        paperId1: number,
        paperId2: number,
        minRelevance: number = 0.4
    ): Promise<Array<ConceptRow & { paper1_relevance: number; paper2_relevance: number; avg_relevance: number }>> {
        const query = `
      SELECT 
        c.*,
        pc1.relevance_score as paper1_relevance,
        pc2.relevance_score as paper2_relevance,
        (pc1.relevance_score + pc2.relevance_score) / 2 as avg_relevance
      FROM concepts c
      JOIN paper_concepts pc1 ON c.id = pc1.concept_id
      JOIN paper_concepts pc2 ON c.id = pc2.concept_id
      WHERE pc1.paper_id = $1 
        AND pc2.paper_id = $2
        AND pc1.relevance_score >= $3
        AND pc2.relevance_score >= $3
      ORDER BY avg_relevance DESC
    `;

        const result = await this.pool.query(query, [paperId1, paperId2, minRelevance]);
        return result.rows;
    }

    /**
     * Insert a relationship between papers
     */
    async insertRelationship(
        sourcePaperId: number,
        targetPaperId: number,
        relationshipType: RelationshipType | null,
        explanation: string,
        confidence: number
    ): Promise<number> {
        const query = `
      INSERT INTO paper_relationships 
        (source_paper_id, target_paper_id, relationship_type, explanation, confidence, validated)
      VALUES ($1, $2, $3, $4, $5, false)
      ON CONFLICT (source_paper_id, target_paper_id, relationship_type) 
      DO UPDATE SET 
        explanation = EXCLUDED.explanation,
        confidence = EXCLUDED.confidence,
        extracted_at = CURRENT_TIMESTAMP
      RETURNING id
    `;

        const result = await this.pool.query<{ id: number }>(
            query,
            [sourcePaperId, targetPaperId, relationshipType, explanation, confidence]
        );

        return result.rows[0].id;
    }

    /**
     * Get papers that need relationship extraction
     * (papers that haven't been processed for relationship_extraction stage)
     */
    async getPapersNeedingRelationships(): Promise<PaperRow[]> {
        const query = `
      SELECT p.* 
      FROM papers p
      WHERE p.is_seminal = false
        AND NOT EXISTS (
          SELECT 1 FROM extraction_logs el
          WHERE el.paper_id = p.id 
          AND el.stage = 'relationship_extraction'
          AND el.status = 'success'
        )
        AND EXISTS (
          SELECT 1 FROM paper_concepts pc
          WHERE pc.paper_id = p.id
        )
      ORDER BY p.id
    `;

        const result = await this.pool.query<PaperRow>(query);
        return result.rows;
    }

    /**
     * Check if a paper has concepts extracted
     */
    async hasConcepts(paperId: number): Promise<boolean> {
        const result = await this.pool.query(
            'SELECT COUNT(*) as count FROM paper_concepts WHERE paper_id = $1',
            [paperId]
        );
        return parseInt(result.rows[0].count) > 0;
    }

    /**
     * Get relationship statistics
     */
    async getRelationshipStats(): Promise<{
        totalRelationships: number;
        byType: Record<string, number>;
        avgConfidence: number;
    }> {
        const totalQuery = 'SELECT COUNT(*) as count FROM paper_relationships';
        const totalResult = await this.pool.query(totalQuery);

        const byTypeQuery = `
      SELECT relationship_type, COUNT(*) as count
      FROM paper_relationships
      GROUP BY relationship_type
      ORDER BY count DESC
    `;
        const byTypeResult = await this.pool.query(byTypeQuery);

        const avgConfQuery = 'SELECT AVG(confidence) as avg FROM paper_relationships';
        const avgConfResult = await this.pool.query(avgConfQuery);

        const byType: Record<string, number> = {};
        byTypeResult.rows.forEach(row => {
            byType[row.relationship_type || 'null'] = parseInt(row.count);
        });

        return {
            totalRelationships: parseInt(totalResult.rows[0].count),
            byType,
            avgConfidence: parseFloat(avgConfResult.rows[0].avg || '0')
        };
    }

    // ========================================================================
    // Validation Methods (Agent #3)
    // ========================================================================

    /**
     * Get all relationships for validation
     */
    async getAllRelationships(): Promise<Array<PaperRelationshipRow & { source_title: string; target_title: string }>> {
        const query = `
            SELECT 
                pr.*,
                sp.title as source_title,
                tp.title as target_title
            FROM paper_relationships pr
            JOIN papers sp ON pr.source_paper_id = sp.id
            JOIN papers tp ON pr.target_paper_id = tp.id
            ORDER BY pr.id
        `;
        const result = await this.pool.query(query);
        return result.rows;
    }

    /**
     * Get unvalidated relationships
     */
    async getUnvalidatedRelationships(): Promise<Array<PaperRelationshipRow & { source_title: string; target_title: string }>> {
        const query = `
            SELECT 
                pr.*,
                sp.title as source_title,
                tp.title as target_title
            FROM paper_relationships pr
            JOIN papers sp ON pr.source_paper_id = sp.id
            JOIN papers tp ON pr.target_paper_id = tp.id
            WHERE pr.validated = FALSE
            ORDER BY pr.id
        `;
        const result = await this.pool.query(query);
        return result.rows;
    }

    /**
     * Update relationship validation status
     */
    async updateRelationshipValidation(
        relationshipId: number,
        validated: boolean
    ): Promise<void> {
        await this.pool.query(
            'UPDATE paper_relationships SET validated = $1 WHERE id = $2',
            [validated, relationshipId]
        );
    }

    /**
     * Get all concepts with their paper links for validation
     */
    async getAllConceptsWithLinks(): Promise<Array<ConceptRow & { paper_count: number }>> {
        const query = `
            SELECT 
                c.*,
                COUNT(pc.paper_id) as paper_count
            FROM concepts c
            LEFT JOIN paper_concepts pc ON c.id = pc.concept_id
            GROUP BY c.id
            ORDER BY c.id
        `;
        const result = await this.pool.query(query);
        return result.rows;
    }

    /**
     * Get paper-concept links with relevance scores
     */
    async getPaperConceptLinks(conceptId: number): Promise<PaperConceptRow[]> {
        const query = `
            SELECT * FROM paper_concepts
            WHERE concept_id = $1
            ORDER BY relevance_score DESC
        `;
        const result = await this.pool.query<PaperConceptRow>(query, [conceptId]);
        return result.rows;
    }

    /**
     * Get validation statistics
     */
    async getValidationStats(): Promise<{
        totalRelationships: number;
        validatedRelationships: number;
        flaggedForReview: number;
        totalConcepts: number;
    }> {
        const relQuery = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN validated = TRUE THEN 1 END) as validated_count,
                COUNT(CASE WHEN confidence < 0.5 THEN 1 END) as low_confidence_count
            FROM paper_relationships
        `;
        const relResult = await this.pool.query(relQuery);

        const conceptQuery = 'SELECT COUNT(*) as count FROM concepts';
        const conceptResult = await this.pool.query(conceptQuery);

        return {
            totalRelationships: parseInt(relResult.rows[0].total),
            validatedRelationships: parseInt(relResult.rows[0].validated_count),
            flaggedForReview: parseInt(relResult.rows[0].low_confidence_count),
            totalConcepts: parseInt(conceptResult.rows[0].count)
        };
    }

    /**
     * Close database connection pool
     */
    async close(): Promise<void> {
        await this.pool.end();
        console.log('🔌 Database connection closed');
    }
}
