/**
 * Relationship Discovery Pipeline Runner (Agent #2)
 * 
 * Processes papers from the database and discovers semantic relationships
 * between papers and the seminal paper using the Relationship Discovery Agent
 */

import * as dotenv from 'dotenv';
import { DatabaseClient } from '../database';
import { RelationshipDiscoveryAgent } from './relationship-discovery-agent';
import { AgentConfig, PaperRow } from '../types';

// Load environment variables
dotenv.config();

/**
 * Main pipeline orchestrator
 */
class RelationshipDiscoveryPipeline {
    private db: DatabaseClient;
    private agent: RelationshipDiscoveryAgent;
    private seminalPaper: PaperRow | null = null;

    constructor(db: DatabaseClient, agent: RelationshipDiscoveryAgent) {
        this.db = db;
        this.agent = agent;
    }

    /**
     * Initialize pipeline by loading seminal paper
     */
    async initialize(): Promise<boolean> {
        console.log('\n🔍 Loading seminal paper...');

        this.seminalPaper = await this.db.getSeminalPaper();

        if (!this.seminalPaper) {
            console.error('❌ No seminal paper found in database!');
            console.error('   Make sure a paper has is_seminal = true');
            return false;
        }

        console.log(`✅ Seminal paper: "${this.seminalPaper.title}"`);
        console.log(`   ArXiv ID: ${this.seminalPaper.arxiv_id}`);

        return true;
    }

    /**
     * Process a single paper to find its relationship with seminal paper
     */
    async processPaper(paper: PaperRow): Promise<boolean> {
        const startTime = Date.now();

        console.log('\n' + '='.repeat(80));
        console.log(`📄 Processing Paper #${paper.id}`);
        console.log(`   Title: ${paper.title}`);
        console.log('='.repeat(80));

        try {
            // Mark as in progress
            await this.db.logExtraction(
                paper.id,
                'relationship_extraction',
                'in_progress'
            );

            // Check if paper has concepts
            const hasConcepts = await this.db.hasConcepts(paper.id);
            if (!hasConcepts) {
                console.warn('   ⚠️  Paper has no extracted concepts - skipping');

                await this.db.logExtraction(
                    paper.id,
                    'relationship_extraction',
                    'failed',
                    'No concepts extracted (Agent #1 may have failed)',
                    (Date.now() - startTime) / 1000
                );

                return false;
            }

            // Get concepts for both papers
            console.log('\n📚 Loading concepts...');

            const minRelevance = 0.4; // As per your specification

            const sourceConcepts = await this.db.getPaperConcepts(paper.id, minRelevance);
            const targetConcepts = await this.db.getPaperConcepts(this.seminalPaper!.id, minRelevance);
            const sharedConcepts = await this.db.getSharedConcepts(
                paper.id,
                this.seminalPaper!.id,
                minRelevance
            );

            console.log(`   Source paper concepts: ${sourceConcepts.length}`);
            console.log(`   Target paper concepts: ${targetConcepts.length}`);
            console.log(`   Shared concepts (≥0.4 relevance): ${sharedConcepts.length}`);

            if (sourceConcepts.length === 0) {
                console.warn('   ⚠️  No concepts found with relevance ≥ 0.4 - skipping');

                await this.db.logExtraction(
                    paper.id,
                    'relationship_extraction',
                    'failed',
                    'No concepts with sufficient relevance (≥0.4)',
                    (Date.now() - startTime) / 1000
                );

                return false;
            }

            // Discover relationship using the agent
            console.log('\n🤖 Calling Relationship Discovery Agent...');

            const relationship = await this.agent.discoverRelationship(
                paper,
                this.seminalPaper!,
                sourceConcepts,
                targetConcepts,
                sharedConcepts
            );

            if (!relationship) {
                console.warn('   ⚠️  Agent returned no valid relationship');

                await this.db.logExtraction(
                    paper.id,
                    'relationship_extraction',
                    'failed',
                    'Agent returned invalid or null relationship',
                    (Date.now() - startTime) / 1000
                );

                return false;
            }

            // Store relationship in database
            console.log('\n💾 Storing relationship...');

            const relationshipId = await this.db.insertRelationship(
                paper.id,                           // source_paper_id
                this.seminalPaper!.id,             // target_paper_id
                relationship.relationship_type,     // relationship_type (can be null)
                relationship.explanation,           // explanation
                relationship.confidence            // confidence
            );

            console.log(`   ✅ Stored relationship #${relationshipId}`);
            console.log(`   Type: ${relationship.relationship_type || 'null'}`);
            console.log(`   Confidence: ${relationship.confidence.toFixed(2)}`);
            console.log(`   Evidence: "${relationship.supporting_evidence.slice(0, 100)}..."`);

            // Calculate processing time
            const processingTime = (Date.now() - startTime) / 1000;

            // Log success
            await this.db.logExtraction(
                paper.id,
                'relationship_extraction',
                'success',
                null,
                processingTime
            );

            console.log(`\n✅ Successfully processed paper #${paper.id} in ${processingTime.toFixed(2)}s`);

            return true;

        } catch (error) {
            const processingTime = (Date.now() - startTime) / 1000;
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log failure
            await this.db.logExtraction(
                paper.id,
                'relationship_extraction',
                'failed',
                errorMessage,
                processingTime
            );

            console.error(`\n❌ Failed to process paper #${paper.id}:`, errorMessage);

            return false;
        }
    }

    /**
     * Process multiple papers
     */
    async processMultiplePapers(papers: PaperRow[]): Promise<void> {
        console.log(`\n🚀 Starting relationship extraction for ${papers.length} papers\n`);

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < papers.length; i++) {
            const paper = papers[i];

            console.log(`\n[${i + 1}/${papers.length}] Processing paper...`);

            const success = await this.processPaper(paper);

            if (success) {
                successCount++;
            } else {
                failureCount++;
            }

            // Add delay between papers to avoid rate limits (as per your specification)
            if (i < papers.length - 1) {
                console.log('\n⏳ Waiting 2 seconds before next paper...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 RELATIONSHIP EXTRACTION SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total papers: ${papers.length}`);
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Failed: ${failureCount}`);
        console.log('='.repeat(80));
    }

    /**
     * Show current database statistics
     */
    async showStats(): Promise<void> {
        const stats = await this.db.getStats();
        const relStats = await this.db.getRelationshipStats();

        console.log('\n' + '='.repeat(80));
        console.log('📊 DATABASE STATISTICS');
        console.log('='.repeat(80));
        console.log(`Total papers in database: ${stats.totalPapers}`);
        console.log(`Papers with concepts: ${stats.processedPapers}`);
        console.log(`Total concepts extracted: ${stats.totalConcepts}`);
        console.log(`Total paper-concept links: ${stats.totalLinks}`);
        console.log('');
        console.log(`Total relationships: ${relStats.totalRelationships}`);
        console.log(`Average confidence: ${relStats.avgConfidence.toFixed(2)}`);

        if (Object.keys(relStats.byType).length > 0) {
            console.log('\nRelationships by type:');
            for (const [type, count] of Object.entries(relStats.byType)) {
                console.log(`   ${type}: ${count}`);
            }
        }

        console.log('='.repeat(80));
    }
}

/**
 * Main entry point
 */
async function main() {
    // Load configuration from environment variables
    const databaseUrl = process.env.DATABASE_URL;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found in environment variables');
        console.error('Please create a .env file with DATABASE_URL');
        process.exit(1);
    }

    if (!anthropicApiKey) {
        console.error('❌ ANTHROPIC_API_KEY not found in environment variables');
        console.error('Please create a .env file with ANTHROPIC_API_KEY');
        process.exit(1);
    }

    // Create database client
    const db = new DatabaseClient(databaseUrl);

    // Test connection
    const connected = await db.testConnection();
    if (!connected) {
        console.error('❌ Could not connect to database');
        process.exit(1);
    }

    // Create agent configuration
    const agentConfig: AgentConfig = {
        anthropicApiKey,
        modelName: process.env.MODEL_NAME || 'claude-sonnet-4-20250514',
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.0')
    };

    // Create agent
    const agent = new RelationshipDiscoveryAgent(agentConfig);

    // Create pipeline
    const pipeline = new RelationshipDiscoveryPipeline(db, agent);

    try {
        // Initialize pipeline (load seminal paper)
        const initialized = await pipeline.initialize();
        if (!initialized) {
            process.exit(1);
        }

        // Show current stats
        await pipeline.showStats();

        // Get papers needing relationship extraction
        const papersNeedingRelationships = await db.getPapersNeedingRelationships();

        if (papersNeedingRelationships.length === 0) {
            console.log('\n✅ All papers have been processed for relationships!');
            console.log('To reprocess papers, delete entries from extraction_logs table where stage = \'relationship_extraction\'.');
            return;
        }

        console.log(`\n📋 Found ${papersNeedingRelationships.length} papers needing relationship extraction`);

        // Ask user for confirmation (in production, you might auto-proceed)
        console.log('\nStarting relationship extraction in 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Process all papers needing relationships
        await pipeline.processMultiplePapers(papersNeedingRelationships);

        // Show final stats
        await pipeline.showStats();

    } catch (error) {
        console.error('\n❌ Pipeline failed:', error);
        process.exit(1);
    } finally {
        // Clean up
        await db.close();
    }
}

// Run the pipeline
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}